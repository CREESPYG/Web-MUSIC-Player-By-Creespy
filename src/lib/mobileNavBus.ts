/** Lets App-level UI (e.g. search results) jump to a MobileShell tab. */
type MobileNavTarget = "player" | "playlist" | "room" | "queue" | "clock" | "customization";

let handler: ((tab: MobileNavTarget) => void) | null = null;
let pendingTab: MobileNavTarget | null = null;

export function setMobileNavHandler(fn: (tab: MobileNavTarget) => void): () => void {
  handler = fn;
  if (pendingTab) {
    const tabToRun = pendingTab;
    pendingTab = null;
    fn(tabToRun);
  }
  return () => {
    if (handler === fn) handler = null;
  };
}

export function requestMobileTab(tab: MobileNavTarget): void {
  if (handler) {
    handler(tab);
  } else {
    pendingTab = tab;
  }
}
