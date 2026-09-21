import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ---------------- Tasks ---------------- */
export interface Task {
  id: string;
  text: string;
  done: boolean;
  at: number;
}

const TASK_KEY = "ripple.tasks.v1";

function loadTasks(): Task[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TASK_KEY) || "null");
    if (Array.isArray(raw)) return raw.slice(0, 40);
  } catch {
    /* noop */
  }
  return [
    { id: "seed-1", text: "Morning routine", done: true, at: Date.now() - 6000 },
    { id: "seed-2", text: "Work session", done: false, at: Date.now() - 3000 },
  ];
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);

  useEffect(() => {
    try {
      localStorage.setItem(TASK_KEY, JSON.stringify(tasks.slice(0, 40)));
    } catch {
      /* noop */
    }
  }, [tasks]);

  const add = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setTasks((prev) => [{ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, text: t.slice(0, 90), done: false, at: Date.now() }, ...prev].slice(0, 40));
  }, []);

  const toggle = useCallback((id: string) => {
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }, []);

  const remove = useCallback((id: string) => {
    setTasks((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clearDone = useCallback(() => {
    setTasks((prev) => prev.filter((x) => !x.done));
  }, []);

  const doneCount = useMemo(() => tasks.filter((t) => t.done).length, [tasks]);

  return { tasks, add, toggle, remove, clearDone, doneCount };
}

/* ---------------- Focus / Pomodoro ---------------- */
export type FocusMode = "focus" | "short" | "long";

export const FOCUS_LENGTHS: Record<FocusMode, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

export const FOCUS_LABEL: Record<FocusMode, string> = {
  focus: "Focus session",
  short: "Short break",
  long: "Long break",
};

const FOCUS_KEY = "ripple.focus.v1";

export function useFocusTimer(onComplete?: (mode: FocusMode) => void) {
  const [mode, setMode] = useState<FocusMode>("focus");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(FOCUS_LENGTHS.focus);
  const [completed, setCompleted] = useState<number>(() => {
    try {
      return JSON.parse(localStorage.getItem(FOCUS_KEY) || "0") || 0;
    } catch {
      return 0;
    }
  });
  const endRef = useRef<number>(0);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_KEY, JSON.stringify(completed));
    } catch {
      /* noop */
    }
  }, [completed]);

  // reset remaining when mode changes and not running
  useEffect(() => {
    if (!running) setRemaining(FOCUS_LENGTHS[mode]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!running) return;
    endRef.current = Date.now() + remaining * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        if (mode === "focus") setCompleted((c) => c + 1);
        cbRef.current?.(mode);
      }
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => {
    setRunning(false);
    setRemaining(FOCUS_LENGTHS[mode]);
  }, [mode]);
  const pick = useCallback((m: FocusMode) => {
    setRunning(false);
    setMode(m);
    setRemaining(FOCUS_LENGTHS[m]);
  }, []);

  const total = FOCUS_LENGTHS[mode];
  const progress = 1 - remaining / total;

  return { mode, running, remaining, completed, progress, toggle, reset, pick };
}
