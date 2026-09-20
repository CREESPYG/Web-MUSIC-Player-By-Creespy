import { AnimatePresence, motion } from "motion/react";

interface Props {
  open: boolean;
  onStay: () => void;
  onExit: () => void;
}

export function MobileBackGuardModal({ open, onStay, onExit }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onStay}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 p-6 shadow-2xl"
            style={{
              background: "linear-gradient(165deg, rgba(20,28,45,0.92), rgba(10,14,24,0.96))",
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Ambient Accent Glow */}
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-30 blur-2xl"
              style={{ background: "var(--acc0)" }}
            />

            {/* Icon & Title */}
            <div className="relative z-10 flex flex-col items-center text-center">
              <div
                className="mb-3.5 grid h-12 w-12 place-items-center rounded-full border border-white/10"
                style={{ background: "rgba(255, 255, 255, 0.06)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--acc0)]">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <path d="M2 8c0-2.2.7-4.3 2-6" />
                  <path d="M22 8c0-2.2-.7-4.3-2-6" />
                </svg>
              </div>
              <h3 className="font-display text-lg font-bold text-[var(--ink)]">Leave Player?</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--dim)]">
                Are you sure you want to close or exit? Your audio playback will pause and current room connection will close.
              </p>
            </div>

            {/* Actions */}
            <div className="relative z-10 mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onStay}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-display text-xs font-bold uppercase tracking-wider text-black shadow-lg transition-transform active:scale-[0.98]"
                style={{ background: "var(--acc0)" }}
              >
                Stay & Keep Playing
              </button>

              <button
                type="button"
                onClick={onExit}
                className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 py-2.5 font-display text-xs font-semibold text-[var(--dim)] transition-colors hover:bg-white/10 hover:text-white active:scale-[0.98]"
              >
                Yes, Exit Player
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
