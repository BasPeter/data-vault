import path from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    // The GitHub OAuth device-flow client id is public (not a secret) and is baked
    // in at build time. Maintainers supply it via DATA_VAULT_GITHUB_CLIENT_ID; an
    // empty value disables GitHub sign-in.
    define: { __GITHUB_CLIENT_ID__: JSON.stringify(process.env.DATA_VAULT_GITHUB_CLIENT_ID ?? "") },
    build: { rollupOptions: { input: { index: path.resolve("electron/main.ts") } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: path.resolve("electron/preload.ts") },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: ".",
    resolve: { alias: { "@": path.resolve("src") } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: { index: path.resolve("index.html") } } },
  },
});
