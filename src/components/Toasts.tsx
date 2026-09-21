import { AnimatePresence, motion } from "motion/react";
import { DropIcon } from "./Icons";

export interface Toast {
  id: number;
  msg: string;
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 22, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 480, damping: 32 }}
            className="glass flex items-center gap-2.5 rounded-full py-2.5 pl-3.5 pr-5"
          >
            <span className="text-[var(--acc0)]">
              <DropIcon size={15} />
            </span>
            <span className="whitespace-nowrap text-[13px] font-semibold text-[var(--ink)]">{t.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
