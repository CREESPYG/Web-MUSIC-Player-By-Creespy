import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useClock } from "../hooks/useClock";
import { LogoIcon } from "./Icons";
import { HeadphonesIcon, ClockOnlyIcon, DiscOnlyIcon } from "./UiIcons";

interface Props {
  open: boolean;
  online: number;
  onEnter: (dest: "player" | "room" | "clock") => void;
}

/**
 * Minimal start screen — a calm entry point that gates into the player.
 * Shown once per session; picks a destination (Music / Rooms / Clock).
 */
export function StartScreen({ open, online, onEnter }: Props) {
  const c = useClock();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 120);
    return () => window.clearTimeout(t);
  }, []);

  const cards: { key: "player" | "room" | "clock"; label: string; sub: string; Icon: typeof DiscOnlyIcon }[] = [
    { key: "player", label: "Music", sub: "Play & discover", Icon: DiscOnlyIcon },
    { key: "room", label: "Listen Together", sub: "Public & private rooms", Icon: HeadphonesIcon },
    { key: "clock", label: "Clock", sub: "Time & weather", Icon: ClockOnlyIcon },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02, filter: "blur(6px)" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center px-6"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* soft top-right status */}
          <div className="absolute right-5 top-5 flex items-center gap-2 font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--dim)]">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--acc0)]" />
            {online} online
          </div>

          <motion.div
            initial={{ y: 22, opacity: 0 }}
            animate={ready ? { y: 0, opacity: 1 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center text-center"
          >
            {/* mark */}
            <motion.span
              className="mb-6 grid h-20 w-20 place-items-center rounded-[26px] border border-white/12"
              style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--acc0) 22%, transparent), rgba(255,255,255,0.04))" }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <LogoIcon size={40} />
            </motion.span>

            <h1 className="font-display text-[clamp(34px,9vw,60px)] font-extrabold leading-none tracking-[0.18em] text-[var(--ink)]">
              CREEP CREEP
            </h1>
            <p className="mt-3 font-tmono text-[10px] uppercase tracking-[0.4em] text-[var(--acc0)]">
              Music Player By CREESPY
            </p>
            <p className="mt-4 max-w-[360px] text-[13.5px] leading-relaxed text-[var(--dim)]">
              {c.greeting}. Synced visuals, live weather, and listen-together rooms — in one calm, glass interface.
            </p>

            {/* entry cards */}
            <div className="mt-9 grid w-full max-w-[440px] grid-cols-1 gap-2.5 sm:grid-cols-3">
              {cards.map((card, i) => (
                <motion.button
                  key={card.key}
                  initial={{ y: 16, opacity: 0 }}
                  animate={ready ? { y: 0, opacity: 1 } : {}}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.5 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onEnter(card.key)}
                  className="glass glass-hover flex flex-col items-center gap-2 rounded-[var(--radius)] px-4 py-5 text-center"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full text-[var(--acc0)]" style={{ background: "color-mix(in srgb, var(--acc0) 14%, transparent)" }}>
                    <card.Icon size={20} />
                  </span>
                  <span className="font-display text-[14px] font-bold text-[var(--ink)]">{card.label}</span>
                  <span className="font-tmono text-[8px] uppercase tracking-[0.14em] text-[var(--dim)]">{card.sub}</span>
                </motion.button>
              ))}
            </div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={ready ? { opacity: 1 } : {}}
              transition={{ delay: 0.5, duration: 0.5 }}
              onClick={() => onEnter("player")}
              className="mt-7 rounded-full px-8 py-3 font-tmono text-[11px] uppercase tracking-[0.2em] text-black"
              style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))", boxShadow: "0 12px 34px -12px var(--acc0)" }}
            >
              Enter player →
            </motion.button>
          </motion.div>

          <p className="absolute bottom-5 font-tmono text-[8px] uppercase tracking-[0.24em] text-[var(--dim)]/60">
            youtube · open-meteo · supabase realtime
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
