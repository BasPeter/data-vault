// @vitest-environment jsdom
//
// DOMPurify sanitizes against a real DOM, so this file alone opts into the
// jsdom environment (the rest of the suite runs under vitest's default node
// environment). See openspec/specs/security/spec.md "Untrusted Content Is
// Sanitized" and "External Input Is Untrusted".
import { describe, expect, it } from "vitest";
import { sanitize } from "./sanitize";

describe("sanitize", () => {
  it("removes script tags", () => {
    const output = sanitize('<p>hi</p><script>alert("pwned")</script>');
    expect(output).not.toContain("<script");
    expect(output).not.toContain("alert(");
    expect(output).toContain("<p>hi</p>");
  });

  it("removes inline event handlers", () => {
    const output = sanitize(`<img src="x.png" onerror="alert(1)">`);
    expect(output).not.toContain("onerror");
    expect(output).not.toContain("alert(1)");
  });

  it("removes javascript: hrefs", () => {
    const output = sanitize(`<a href="javascript:alert(1)">click</a>`);
    expect(output).not.toContain("javascript:");
  });

  it("removes the target attribute so hostile documents can't force window.open", () => {
    const output = sanitize(`<a href="https://example.com" target="_blank">link</a>`);
    expect(output).not.toContain("target=");
    expect(output).toContain('href="https://example.com"');
  });

  it("preserves benign markup", () => {
    const output = sanitize("<h1>Title</h1><p>Some <strong>bold</strong> text.</p>");
    expect(output).toContain("<h1>Title</h1>");
    expect(output).toContain("<strong>bold</strong>");
  });
});
