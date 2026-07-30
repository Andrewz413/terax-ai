import { useRefTooltipStore } from "../lib/refTooltipController";

const OFFSET = 12;
const MAX_WIDTH = 384;
const EST_HEIGHT = 88;

export function TerminalRefTooltip() {
  const view = useRefTooltipStore((s) => s.view);
  if (!view) return null;
  const left = Math.max(
    OFFSET,
    Math.min(view.x + OFFSET, window.innerWidth - MAX_WIDTH - OFFSET),
  );
  const top = Math.min(view.y + OFFSET, window.innerHeight - EST_HEIGHT);
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-sm rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md"
      style={{ left, top }}
    >
      <div className="font-mono text-xs font-semibold">{view.token}</div>
      <div className="mt-0.5 text-xs leading-snug">
        {view.status === "loading" && (
          <span className="text-muted-foreground">Loading...</span>
        )}
        {view.status === "ready" && view.title}
        {view.status === "missing" && (
          <span className="text-muted-foreground">
            No definition found in the lookup file
          </span>
        )}
        {view.status === "error" && (
          <span className="text-muted-foreground">
            Lookup file could not be read
          </span>
        )}
      </div>
      <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
        {view.file}
        {view.line != null ? `:${view.line}` : ""}
      </div>
    </div>
  );
}
