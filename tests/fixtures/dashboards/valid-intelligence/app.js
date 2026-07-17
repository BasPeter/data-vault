const list = globalThis.document.querySelector("#documents");
const accessStatus = globalThis.document.querySelector("#access-status");
const snapshot = await globalThis.window.dashboardApi.readVaultIndex();

for (const indexedDocument of snapshot.documents) {
  const item = globalThis.document.createElement("li");
  item.textContent = indexedDocument.title;
  list.append(item);
}

const approved = snapshot.documents[0];
if (approved) {
  const result = await globalThis.window.dashboardApi.readDocuments([approved.id]);
  const preview = globalThis.document.createElement("p");
  preview.id = "approved-document";
  preview.textContent = result.documents[0]?.content ?? "";
  globalThis.document.body.append(preview);
  accessStatus.textContent = "Approved document rendered as plain text.";
}

try {
  await globalThis.window.dashboardApi.readDocuments(["not-approved.html"]);
} catch {
  globalThis.document.documentElement.dataset.unapproved = "denied";
  accessStatus.textContent += " Unapproved document access was denied.";
}
