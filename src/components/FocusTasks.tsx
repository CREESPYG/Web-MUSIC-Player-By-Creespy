import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useFocusTimer, useTasks, FOCUS_LABEL, type FocusMode } from "../hooks/useFocus";
import { fmtTime } from "../lib/color";
import { cn } from "../utils/cn";
import {
  CheckboxDoneIcon,
  CheckboxIcon,
  PauseFillIcon,
  PlayFillIcon,
  PlusIcon,
  RestartIcon,
  TasksIcon,
  TimerIcon,
  TrashIcon,
} from "./UiIcons";

const R = 52;
const C = 2 * Math.PI * R;

const MODES: { v: FocusMode; label: string }[] = [
  { v: "focus", label: "Focus" },
  { v: "short", label: "Short" },
  { v: "long", label: "Long" },
];

export function FocusTasks({ onToast }: { onToast?: (msg: string) => void }) {
  const focus = useFocusTimer((m) => onToast?.(m === "focus" ? "Focus session complete — take a break" : "Break over — back to focus"));
  const { tasks, add, toggle, remove, clearDone, doneCount } = useTasks();
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!draft.trim()) return;
    add(draft);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3.5 md:p-4 rounded-[28px] border border-white/8 bg-[var(--bg1,#161e28)] select-none shadow-none">
      {/* ---------- focus timer ---------- */}
      <div className="flex shrink-0 items-center gap-4">
        {/* ring */}
        <div className="relative grid h-[92px] w-[92px] shrink-0 place-items-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="6" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="var(--acc0)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - focus.progress)}
              style={{ filter: "drop-shadow(0 0 5px var(--acc0))", transition: "stroke-dashoffset 0.4s linear" }}
            />
          </svg>
          <div className="flex flex-col items-center">
            <span className="font-display text-[22px] font-extrabold leading-none tabular-nums text-[var(--ink)]">
              {fmtTime(focus.remaining)}
            </span>
            <span className="mt-0.5 flex items-center gap-1 font-tmono text-[7px] uppercase tracking-[0.14em] text-[var(--acc0)]">
              <TimerIcon size={8} /> focus
            </span>
          </div>
        </div>

        {/* controls + mode */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-tmono text-[8.5px] uppercase tracking-[0.22em] text-[var(--dim)]">
              {FOCUS_LABEL[focus.mode]}
            </span>
            {focus.completed > 0 && (
              <span className="font-tmono text-[8.5px] uppercase tracking-[0.14em] text-[var(--acc2)]">
                {focus.completed}✓ today
              </span>
            )}
          </div>

          {/* mode pills */}
          <div className="mt-2 flex gap-1">
            {MODES.map((m) => {
              const on = focus.mode === m.v;
              return (
                <button
                  key={m.v}
                  onClick={() => focus.pick(m.v)}
                  className="flex-1 rounded-lg py-1.5 font-tmono text-[8.5px] uppercase tracking-[0.1em] transition-all"
                  style={{
                    background: on ? "linear-gradient(135deg,var(--acc0),var(--acc1))" : "rgba(255,255,255,0.05)",
                    color: on ? "#06101c" : "var(--dim)",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* play / reset */}
          <div className="mt-2 flex gap-2">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={focus.toggle}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 font-tmono text-[9px] uppercase tracking-[0.14em] text-black"
              style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))", boxShadow: "0 8px 22px -10px var(--acc0)" }}
              aria-label={focus.running ? "Pause focus" : "Start focus"}
            >
              {focus.running ? <PauseFillIcon size={13} /> : <PlayFillIcon size={13} />}
              {focus.running ? "pause" : "start"}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={focus.reset}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-[var(--dim)] transition-colors hover:text-[var(--acc0)]"
              aria-label="Reset timer"
            >
              <RestartIcon size={15} />
            </motion.button>
          </div>
        </div>
      </div>

      <div className="my-3 h-px shrink-0 bg-white/8" />

      {/* ---------- task log ---------- */}
      <div className="mb-2 flex shrink-0 items-center justify-between px-0.5">
        <h3 className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          <TasksIcon size={13} className="text-[var(--acc0)]" /> Tasks
        </h3>
        <span className="font-tmono text-[8.5px] uppercase tracking-[0.14em] text-[var(--dim)]">
          {doneCount}/{tasks.length} done
        </span>
      </div>

      <div className="mb-2 flex shrink-0 gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-[var(--radius-s)] border border-white/12 bg-white/6 px-3 py-2 text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)]/60"
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={submit}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-s)] text-black"
          style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
          aria-label="Add task"
        >
          <PlusIcon size={15} />
        </motion.button>
      </div>

      <ul className="scroll-slim flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
        <AnimatePresence initial={false}>
          {tasks.length === 0 && (
            <motion.li
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid flex-1 place-items-center py-6 text-center font-tmono text-[9px] uppercase tracking-[0.18em] text-[var(--dim)]/60"
            >
              no tasks yet — add one above
            </motion.li>
          )}
          {tasks.map((t) => (
            <motion.li
              key={t.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="group flex items-center gap-2.5 rounded-[var(--radius-s)] px-2 py-1.5 transition-colors hover:bg-white/4"
            >
              <button
                onClick={() => toggle(t.id)}
                className={cn("shrink-0 transition-colors", t.done ? "text-[var(--acc0)]" : "text-[var(--dim)] hover:text-[var(--ink)]")}
                aria-label={t.done ? "Mark incomplete" : "Mark complete"}
              >
                {t.done ? <CheckboxDoneIcon size={20} /> : <CheckboxIcon size={20} />}
              </button>
              <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", t.done ? "text-[var(--dim)] line-through" : "text-[var(--ink)]")}>
                {t.text}
              </span>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 text-[var(--dim)] opacity-0 transition-all hover:text-[#ff9aa6] group-hover:opacity-100 focus:opacity-100"
                aria-label="Delete task"
              >
                <TrashIcon size={14} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {doneCount > 0 && (
        <button
          onClick={clearDone}
          className="mt-2 shrink-0 self-start font-tmono text-[8.5px] uppercase tracking-[0.16em] text-[var(--dim)] transition-colors hover:text-[#ff9aa6]"
        >
          clear {doneCount} completed
        </button>
      )}
    </div>
  );
}
