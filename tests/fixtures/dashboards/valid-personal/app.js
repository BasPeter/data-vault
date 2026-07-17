const status = globalThis.document.querySelector("#status");
const complete = globalThis.document.querySelector("#complete");

const state = (await globalThis.window.dashboardApi.readState()) ?? { completed: false };
status.textContent = state.completed ? "Synthetic goal completed." : "Ready for a synthetic goal.";

complete.addEventListener("click", async () => {
  await globalThis.window.dashboardApi.writeState({ completed: true });
  status.textContent = "Synthetic goal completed.";
});
