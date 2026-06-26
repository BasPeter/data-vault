import { useEffect, useRef, useState } from "react";
import { FileQuestion, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BlameLine, LoadedDoc } from "@/types";
import DOMPurify from "dompurify";

type Status = "idle" | "loading" | "loaded" | "error" | "empty";

async function renderMermaid(container: HTMLElement) {
  const blocks = container.querySelectorAll<HTMLElement>(".mermaid");
  if (!blocks.length) return;
  const isDark = document.documentElement.classList.contains("dark");
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "strict",
  });
  blocks.forEach((b) => b.removeAttribute("data-processed"));
  await mermaid.run({ nodes: Array.from(blocks) });
}

export function DocumentView({
  vaultId,
  docId,
  theme,
  version,
  showBlame,
  documentIds,
  onNavigateDocument,
}: {
  vaultId: string;
  docId: string | null;
  theme: "light" | "dark";
  version: number;
  showBlame: boolean;
  documentIds: Set<string>;
  onNavigateDocument: (id: string) => void;
}) {
  const [doc, setDoc] = useState<LoadedDoc | null>(null);
  const [status, setStatus] = useState<Status>("empty");
  const [blame, setBlame] = useState<BlameLine[] | null>(null);
  const [blameError, setBlameError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Fetch the document fragment whenever the selection or vault version changes.
  useEffect(() => {
    if (!docId) {
      setDoc(null);
      setStatus("empty");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    window.vaultApi
      .document(vaultId, docId)
      .then((data: LoadedDoc) => {
        if (cancelled) return;
        setDoc(data);
        setStatus("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setDoc(null);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [vaultId, docId, version]);

  useEffect(() => {
    if (!showBlame || !docId) return;
    let cancelled = false;
    setBlame(null);
    setBlameError(null);
    window.vaultApi
      .blame(vaultId, docId)
      .then((lines) => {
        if (!cancelled) setBlame(lines);
      })
      .catch((cause) => {
        if (!cancelled) setBlameError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [vaultId, docId, version, showBlame]);

  // Inject the document and (re)render Mermaid diagrams. Re-runs on theme change.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || status !== "loaded" || !doc) return;
    let cancelled = false;
    let removeGutter = () => {};
    renderDocumentHtml(doc, showBlame)
      .then((html) => {
        if (cancelled) return;
        el.innerHTML = DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true },
          ADD_ATTR: ["data-vault-source-line"],
          FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
        });
        normalizeMarkdownMermaid(el);
      })
      .then(() => {
        if (!cancelled && doc.format === "markdown")
          installMarkdownNavigation(el, doc.id, documentIds, onNavigateDocument);
      })
      .then(() => renderMermaid(el))
      .catch((err) => console.error("Mermaid render failed", err))
      .then(() => {
        if (!cancelled && doc.format === "html" && showBlame && blame) removeGutter = installBlameGutter(el, blame);
      });
    return () => {
      cancelled = true;
      removeGutter();
    };
  }, [doc, status, theme, showBlame, blame, documentIds, onNavigateDocument]);

  if (status === "empty") {
    return (
      <Placeholder
        icon={<FileQuestion className="size-10" />}
        title="No document selected"
        subtitle="Choose a document from the sidebar."
      />
    );
  }
  if (status === "loading") {
    return <Placeholder icon={<Loader2 className="size-10 animate-spin" />} title="Loading…" />;
  }
  if (status === "error" || !doc) {
    return (
      <Placeholder
        icon={<FileQuestion className="size-10" />}
        title="Document not found"
        subtitle={docId ?? undefined}
      />
    );
  }

  return (
    <article className={cn("mx-auto w-full px-6 py-8", showBlame ? "max-w-5xl" : "max-w-4xl")}>
      {showBlame && !blame && !blameError && (
        <div className="text-muted-foreground mb-3 flex items-center gap-2 text-xs">
          <Loader2 className="size-3 animate-spin" />
          Loading line history…
        </div>
      )}
      {showBlame && blameError && (
        <div role="alert" className="text-destructive mb-3 text-xs">
          Line history unavailable: {blameError}
        </div>
      )}
      {(doc.meta.date || (doc.meta.tags && doc.meta.tags.length > 0)) && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {doc.meta.date && <span className="text-muted-foreground text-sm">{doc.meta.date}</span>}
          {doc.meta.tags?.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <div ref={contentRef} className={cn("doc-content", showBlame && "blame-mode")} />
    </article>
  );
}

async function renderDocumentHtml(doc: LoadedDoc, showBlame: boolean): Promise<string> {
  if (doc.format === "html") return showBlame ? annotateSourceLines(doc.html, doc.sourceStartLine) : doc.html;
  const { marked } = await import("marked");
  const html = await marked.parse(doc.source, { async: false, gfm: true });
  return String(html);
}

function normalizeMarkdownMermaid(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>("pre > code.language-mermaid").forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;
    pre.className = "mermaid";
    pre.textContent = code.textContent ?? "";
  });
}

function resolveMarkdownHref(sourceId: string, href: string, documentIds: Set<string>): string | null {
  const trimmed = href.trim();
  if (!trimmed || /^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) return null;
  const withoutQuery = trimmed.split("?")[0];
  const target = withoutQuery.startsWith("#") ? withoutQuery.slice(1) : withoutQuery.split("#")[0];
  if (!target.toLowerCase().endsWith(".md")) return null;
  const base = sourceId.includes("/") ? sourceId.slice(0, sourceId.lastIndexOf("/")) : "";
  const parts = `${base ? `${base}/` : ""}${target.startsWith("/") ? target.slice(1) : target}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!stack.length) return null;
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  const id = stack.join("/");
  return documentIds.has(id) ? id : null;
}

function installMarkdownNavigation(
  container: HTMLElement,
  sourceId: string,
  documentIds: Set<string>,
  onNavigateDocument: (id: string) => void,
): void {
  container.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) return;
    const target = resolveMarkdownHref(sourceId, href, documentIds);
    if (!target) return;
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      onNavigateDocument(target);
    });
  });
}

function annotateSourceLines(html: string, sourceStartLine: number): string {
  const openingTag = /<([a-z][\w:-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  return html.replace(openingTag, (tag, _name: string, offset: number) => {
    const line = sourceStartLine + html.slice(0, offset).split("\n").length - 1;
    return tag
      .replace(/\sdata-vault-source-line=(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
      .replace(/(\/?>)$/, ` data-vault-source-line="${line}"$1`);
  });
}

function compactAuthor(author: string): string {
  if (author.length <= 11) return author;
  const initials = author
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return initials || author.slice(0, 11);
}

function installBlameGutter(container: HTMLElement, lines: BlameLine[]): () => void {
  const byLine = new Map(lines.map((line) => [line.lineNumber, line]));
  const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "2-digit" });
  const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
  const targets = Array.from(
    container.querySelectorAll<HTMLElement>(
      ":is(h1, h2, h3, h4, p, blockquote, pre, li, table)[data-vault-source-line]",
    ),
  );
  const entries: Array<{ target: HTMLElement; marker: HTMLSpanElement }> = [];

  targets.forEach((element) => {
    const history = byLine.get(Number(element.dataset.vaultSourceLine));
    if (!history) return;
    const parent = element.parentElement?.closest<HTMLElement>("[data-vault-source-line]");
    if (parent?.dataset.vaultSourceLine === element.dataset.vaultSourceLine) return;
    const edited = history.timestamp ? shortDate.format(new Date(history.timestamp)) : "Uncommitted";
    const exact = history.timestamp ? fullDate.format(new Date(history.timestamp)) : "Uncommitted";
    const marker = document.createElement("span");
    marker.className = "blame-marker";
    marker.textContent = `${compactAuthor(history.author)}\n${edited}`;
    marker.title = `${history.author} — ${exact}${history.summary ? `\n${history.summary}` : ""}${history.commit ? `\n${history.commit}` : ""}`;
    container.append(marker);
    entries.push({ target: element, marker });
  });

  const align = () => {
    const containerTop = container.getBoundingClientRect().top;
    for (const { target, marker } of entries) {
      marker.style.top = `${target.getBoundingClientRect().top - containerTop}px`;
    }
  };
  align();
  const observer = new ResizeObserver(align);
  observer.observe(container);
  window.addEventListener("resize", align);
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", align);
    entries.forEach(({ marker }) => marker.remove());
  };
}

function Placeholder({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      {icon}
      <p className="text-base font-medium">{title}</p>
      {subtitle && <p className="text-sm">{subtitle}</p>}
    </div>
  );
}
