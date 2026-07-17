const result = {
  applicationApiVisible: typeof globalThis.window.vaultApi !== "undefined",
  electronVisible: typeof globalThis.window.electron !== "undefined",
  nodeVisible: typeof globalThis.window.process !== "undefined" || typeof globalThis.window.require !== "undefined",
};

globalThis.__boundaryProbeVersion = "fixture-original";
globalThis.document.querySelector("#result").textContent = JSON.stringify(result);
