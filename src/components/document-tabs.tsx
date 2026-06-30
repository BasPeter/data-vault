import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

type DocumentTab = {
  id: string;
  title: string;
};

type Props = {
  tabs: DocumentTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
  onCloseOthers: (id: string) => void;
  onCloseToLeft: (id: string) => void;
  onCloseToRight: (id: string) => void;
  onCopyPath: (id: string) => void;
};

export function DocumentTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCloseAll,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
  onCopyPath,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const updateScrollState = () => {
      setCanScrollLeft(scroller.scrollLeft > 0);
      setCanScrollRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    };
    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(scroller);
    scroller.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", updateScrollState);
    };
  }, [tabs]);

  if (tabs.length === 0) return null;

  const scrollByPage = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * Math.max(160, scroller.clientWidth * 0.7), behavior: "smooth" });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const currentIndex = activeIndex >= 0 ? activeIndex : 0;
      const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
      onSelect(tabs[nextIndex].id);
    }
    if ((event.key === "Delete" || event.key === "Backspace") && activeId) {
      event.preventDefault();
      onClose(activeId);
    }
  };

  return (
    <div className="app-no-drag bg-background sticky top-14 z-10 isolate flex h-10 shrink-0 items-end">
      <span aria-hidden="true" className="bg-border absolute inset-x-0 bottom-0 z-10 h-px" />
      {canScrollLeft && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Scroll tabs left"
          title="Scroll tabs left"
          className="absolute top-1/2 left-1 z-10 -translate-y-1/2 bg-background/90 shadow-sm"
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeft />
        </Button>
      )}
      <div
        ref={scrollerRef}
        className="document-tabs-scrollbar flex h-10 min-w-0 flex-1 items-end overflow-x-auto px-2"
        role="tablist"
        aria-label="Open documents"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <ContextMenu key={tab.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    "group relative flex h-9 max-w-56 min-w-32 shrink-0 items-center rounded-t-md border px-2",
                    active
                      ? "bg-background text-foreground border-border z-20 -mb-px border-b-background"
                      : "bg-muted/35 text-muted-foreground hover:bg-muted/70 border-transparent border-b-0",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={`${tab.title}\n${tab.id}`}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-sm outline-none focus-visible:underline",
                      active && "font-semibold",
                    )}
                    onClick={() => onSelect(tab.id)}
                  >
                    {tab.title}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Close ${tab.title}`}
                    title={`Close ${tab.title}`}
                    className="ml-1 size-6 shrink-0 opacity-70 hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(tab.id);
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onCopyPath(tab.id)}>
                  <Copy />
                  Copy path
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => onClose(tab.id)}>
                  <X />
                  Close tab
                </ContextMenuItem>
                <ContextMenuItem disabled={tabs.length <= 1} onSelect={() => onCloseOthers(tab.id)}>
                  Close others
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={tabs.findIndex((candidate) => candidate.id === tab.id) <= 0}
                  onSelect={() => onCloseToLeft(tab.id)}
                >
                  Close tabs to the left
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={tabs.findIndex((candidate) => candidate.id === tab.id) >= tabs.length - 1}
                  onSelect={() => onCloseToRight(tab.id)}
                >
                  Close tabs to the right
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={tabs.length === 0} onSelect={onCloseAll}>
                  Close all
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      {canScrollRight && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Scroll tabs right"
          title="Scroll tabs right"
          className="absolute top-1/2 right-1 z-10 -translate-y-1/2 bg-background/90 shadow-sm"
          onClick={() => scrollByPage(1)}
        >
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}
