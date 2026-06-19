import { useEffect, useRef, useState } from "react";
import { FileQuestion, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LoadedDoc } from "@/types";
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
}: {
  vaultId: string;
  docId: string | null;
  theme: "light" | "dark";
  version: number;
}) {
  const [doc, setDoc] = useState<LoadedDoc | null>(null);
  const [status, setStatus] = useState<Status>("empty");
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
    window.vaultApi.document(vaultId, docId)
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

  // Inject the HTML and (re)render Mermaid diagrams. Re-runs on theme change.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || status !== "loaded" || !doc) return;
    el.innerHTML = DOMPurify.sanitize(doc.html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    });
    renderMermaid(el).catch((err) => console.error("Mermaid render failed", err));
  }, [doc, status, theme]);

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
    return (
      <Placeholder
        icon={<Loader2 className="size-10 animate-spin" />}
        title="Loading…"
      />
    );
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
    <article className="mx-auto w-full max-w-4xl px-6 py-8">
      {(doc.meta.date || (doc.meta.tags && doc.meta.tags.length > 0)) && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {doc.meta.date && (
            <span className="text-muted-foreground text-sm">{doc.meta.date}</span>
          )}
          {doc.meta.tags?.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      <div ref={contentRef} className="doc-content" />
    </article>
  );
}

function Placeholder({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      {icon}
      <p className="text-base font-medium">{title}</p>
      {subtitle && <p className="text-sm">{subtitle}</p>}
    </div>
  );
}
