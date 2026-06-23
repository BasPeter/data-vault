import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!existsSync(path.join(root, ".git"))) {
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", "scripts/git-hooks"], {
    cwd: root,
    stdio: "ignore",
  });
  console.log("Configured Git hooks from scripts/git-hooks.");
} catch (error) {
  console.warn(`Skipping Git hook setup: ${error.message}`);
}
