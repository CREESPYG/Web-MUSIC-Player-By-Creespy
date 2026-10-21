/** Main-area screens (screen-by-screen navigation — no sidebars). */
export type ScreenId = "player" | "library" | "rooms" | "history" | "settings" | "search";

export const SCREEN_TABS: { id: ScreenId; label: string }[] = [
  { id: "library", label: "library" },
  { id: "rooms", label: "rooms" },
  { id: "history", label: "history" },
  { id: "settings", label: "settings" },
];
