import { createServer, type IncomingMessage, type Server } from "node:http";
import { expect, test } from "./electron-app";

type MockOpenCode = {
  port: number;
  requests: Array<{ method: string; path: string; body: string }>;
  close: () => Promise<void>;
};

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

/** A local HTTP double for the fixed subset of the user-managed OpenCode API. */
async function startMockOpenCode(): Promise<MockOpenCode> {
  const requests: MockOpenCode["requests"] = [];
  let prompted = false;
  const server: Server = createServer(async (request, response) => {
    const path = request.url ?? "";
    const body = await requestBody(request);
    requests.push({ method: request.method ?? "", path, body });

    const json = (value: unknown, status = 200) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.method === "GET" && path === "/global/health") {
      json({ healthy: true, version: "1.1.10" });
    } else if (request.method === "POST" && path === "/session") {
      json({ id: "owned-session", title: "New chat", time: { created: "2026-08-12T12:00:00Z" } });
    } else if (request.method === "GET" && path === "/session/status") {
      json(
        prompted
          ? { "owned-session": { type: "busy" }, "external-session": { type: "idle" } }
          : { "external-session": { type: "idle" } },
      );
    } else if (request.method === "GET" && path === "/session/owned-session/message") {
      json(
        prompted
          ? [
              {
                info: { id: "assistant-message", role: "assistant", time: { created: "2026-08-12T12:00:01Z" } },
                parts: [{ type: "text", text: "Mock reply" }],
              },
            ]
          : [],
      );
    } else if (request.method === "POST" && path === "/session/owned-session/prompt_async") {
      if (body.includes("fail request")) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end("{}");
      } else {
        prompted = true;
        response.writeHead(204);
        response.end();
      }
    } else if (request.method === "POST" && path === "/session/owned-session/abort") {
      prompted = false;
      json({ ok: true });
    } else {
      response.writeHead(404, { "content-type": "application/json" });
      response.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock OpenCode did not bind a TCP port.");

  return {
    port: address.port,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

test("native OpenCode chat discloses authority and operates only its owned session without vault context", async ({
  appLaunch,
}) => {
  const { app, page, vaultDir } = appLaunch;
  const mock = await startMockOpenCode();
  try {
    // This is runtime proof, rather than a launch-argument assertion. Linux
    // needs a real keyring backend; macOS and Windows use Electron's documented
    // platform encryption and must fail closed when it is unavailable.
    const storage = await app.evaluate(({ safeStorage }) => ({
      available: safeStorage.isEncryptionAvailable(),
      backend: process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : process.platform,
    }));
    expect(storage.available, `OpenCode setup requires secure storage (backend: ${storage.backend}).`).toBe(true);
    if (process.platform === "linux") expect(storage.backend).toBe("gnome_libsecret");

    await page.getByRole("button", { name: "Open OpenCode chat" }).click();
    const setup = page.getByRole("region", { name: "OpenCode setup" });
    await expect(setup).toContainText("runs separately with your OS authority");
    await expect(setup).toContainText(
      "execute commands, read local files and provider credentials, and use the network",
    );
    await expect(setup).toContainText("provides no vault context or application privilege");

    await setup.getByLabel("OpenCode port").fill(String(mock.port));
    await setup.getByLabel("OpenCode username").fill("e2e-user");
    await setup.getByLabel("OpenCode password").fill("e2e-password");
    await setup.getByRole("checkbox").check();
    await setup.getByRole("button", { name: "Save setup" }).click();
    await expect(setup).toBeHidden();

    await page.getByRole("button", { name: "New" }).click();
    await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
    await expect(page.getByText("external-session", { exact: true })).toHaveCount(0);

    await page.getByLabel("Message OpenCode").fill("hello from the native chat");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("button", { name: "Abort prompt" })).toBeVisible();
    await page.getByRole("button", { name: "Abort prompt" }).click();
    await expect(page.getByRole("button", { name: "Abort prompt" })).toHaveCount(0);

    // A prompt failure remains host-owned and leaves the loaded vault shell usable.
    await page.getByLabel("Message OpenCode").fill("fail request");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert")).toContainText("OpenCode request failed.");
    await expect(page.getByRole("button", { name: "Welcome" })).toBeVisible();
    await expect(page.getByLabel("Message OpenCode")).toBeEnabled();

    const transmitted = JSON.stringify(mock.requests);
    expect(transmitted).not.toContain(vaultDir);
    expect(transmitted).not.toContain("Example Vault");
    expect(transmitted).not.toContain("external-session");
    expect(mock.requests.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        "/global/health",
        "/session",
        "/session/status",
        "/session/owned-session/message",
        "/session/owned-session/prompt_async",
        "/session/owned-session/abort",
      ]),
    );
  } finally {
    await mock.close();
  }
});
