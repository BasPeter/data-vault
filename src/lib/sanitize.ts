import DOMPurify from "dompurify";

// Central sanitize helper for every untrusted HTML fragment inserted into the
// DOM (vault documents, quick notes, rendered Markdown, release notes). One
// config lives here so hardening it (e.g. FORBID_ATTR) protects every caller.
// `target` is stripped so a hostile document can't force window.open via a
// click; plain in-place navigation is already blocked elsewhere.
const FORBID_TAGS = ["script", "style", "iframe", "object", "embed", "form"];

export function sanitize(html: string, options?: { addAttr?: string[] }): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR: ["target"],
    ADD_ATTR: options?.addAttr,
  });
}
