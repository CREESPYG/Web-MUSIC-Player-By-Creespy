export type BgImportSource = "spotify" | "jiosaavn" | "soundcloud" | "youtube" | "custom";

export interface BackgroundImportState {
  active: boolean;
  cancelled: boolean;
  source: BgImportSource;
  status: string;
  done: number;
  total: number;
  targetTitle: string;
  /** Fully-resolved player tracks committed so far. */
  completedCount: number;
}

type Listener = (s: BackgroundImportState) => void;

let state: BackgroundImportState = {
  active: false,
  cancelled: false,
  source: "custom",
  status: "",
  done: 0,
  total: 0,
  targetTitle: "",
  completedCount: 0,
};

const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l(state));
}

export const bgImport = {
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get(): BackgroundImportState {
    return state;
  },
  start(source: BgImportSource, targetTitle: string, total: number): void {
    state = {
      active: true,
      cancelled: false,
      source,
      status: "Starting import…",
      done: 0,
      total,
      targetTitle,
      completedCount: 0,
    };
    emit();
  },
  setStatus(status: string): void {
    state = { ...state, status };
    emit();
  },
  setProgress(done: number, total: number, status?: string): void {
    state = { ...state, done, total, ...(status ? { status } : {}) };
    emit();
  },
  tick(completedCount: number, status: string): void {
    state = { ...state, completedCount, status };
    emit();
  },
  finish(status: string, completedCount?: number): void {
    state = {
      ...state,
      active: false,
      cancelled: false,
      status,
      done: state.total,
      completedCount: completedCount ?? state.completedCount,
    };
    emit();
  },
  cancel(): void {
    if (!state.active) return;
    state = { ...state, cancelled: true, status: "Cancelling…" };
    emit();
  },
  clear(): void {
    state = {
      active: false,
      cancelled: false,
      source: "custom",
      status: "",
      done: 0,
      total: 0,
      targetTitle: "",
      completedCount: 0,
    };
    emit();
  },
};

/** Convenience: display progress as a small floating window (bottom-right). */
export function bgPercent(s: BackgroundImportState): number {
  if (s.total <= 0) return 0;
  return Math.round((s.done / s.total) * 100);
}
