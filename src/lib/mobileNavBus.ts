/** Lets App-level UI (e.g. search results) jump to a MobileShell tab. */
type MobileNavTarget = "player" | "playlist" | "room" | "queue" | "clock" | "customization";

let handler: ((tab: MobileNavTarget) => void) | null = null;

export function setMobileNavHandler(fn: (tab: MobileNavTarget) => void): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function requestMobileTab(tab: MobileNavTarget): void {
  handler?.(tab);
}
