import { motion } from "motion/react";
import { useClock } from "../hooks/useClock";
import { WMO, toUnit, unitLabel, type WeatherNow } from "../lib/weather";
import { WeatherIcon } from "./WeatherIcon";
import { LocationIcon } from "./UiIcons";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons";
import type { PlayerApi } from "../hooks/usePlayer";
import { fmtTime } from "../lib/color";
import type { Track } from "../lib/media";

import { DigitFlipper } from "./DigitFlipper";

interface Props {
  weather: WeatherNow | null;
  unit: "c" | "f";
  clock24: boolean;
  showSeconds: boolean;
  player: PlayerApi;
  track?: Track;
}

/** Minimal full-view "Time screen" — giant DigitFlipper clock, weather, and a slim now-playing strip. */
export function TimeScreen({ weather, unit, clock24, showSeconds, player, track }: Props) {
  const c = useClock();
  const time = clock24 ? `${String(c.h24).padStart(2, "0")}:${c.mm}` : `${c.hh}:${c.mm}`;
  const progress = player.duration > 0 ? Math.min(100, (player.time / player.duration) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-4 py-6 select-none">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center"
      >
        <p className="font-tmono text-[11px] md:text-xs uppercase tracking-[0.45em] text-[var(--acc0)] drop-shadow">
          {c.greeting}
        </p>

        {/* Giant DigitFlipper Clock */}
        <div className="mt-2 flex items-baseline justify-center font-display text-[22vw] sm:text-[20vw] md:text-[180px] lg:text-[230px] xl:text-[270px] font-black leading-none drop-shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
          <DigitFlipper
            value={time}
            className="text-[var(--ink)]"
            colonClassName="opacity-80 text-[var(--ink)]"
          />

          {showSeconds && (
            <div className="ml-[0.04em] flex items-baseline text-[0.32em] font-extrabold text-[var(--acc0)]">
              <span className="opacity-80">:</span>
              <DigitFlipper value={c.ss} className="text-[var(--acc0)]" />
            </div>
          )}

          {!clock24 && (
            <span className="ml-[0.14em] text-[0.15em] font-bold uppercase tracking-wider text-[var(--dim)]">
              {c.ampm}
            </span>
          )}
        </div>

        <p className="mt-2 text-base font-semibold text-[var(--dim)] md:text-xl drop-shadow-sm">
          {c.dateLong}
        </p>
      </motion.div>

      {weather && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="glass flex items-center gap-5 rounded-[var(--radius)] px-6 py-4"
        >
          <span className="text-[var(--acc0)]">
            <WeatherIcon code={weather.code} isDay={weather.isDay} size={44} />
          </span>
          <div className="text-left">
            <p className="font-display text-2xl font-extrabold leading-none tabular-nums text-[var(--ink)]">
              {Math.round(toUnit(weather.tempC, unit))}
              {unitLabel(unit)}
            </p>
            <p className="mt-1 text-[12.5px] font-semibold text-[var(--dim)]">{WMO[weather.code]?.label}</p>
          </div>
          <span className="mx-1 h-9 w-px bg-white/10" />
          <p className="flex items-center gap-1.5 font-tmono text-[9.5px] uppercase tracking-[0.16em] text-[var(--dim)]">
            <LocationIcon size={12} />
            <span className="max-w-[130px] truncate">{weather.place}</span>
          </p>
        </motion.div>
      )}

      {/* slim now-playing */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="glass flex w-full max-w-[440px] items-center gap-3 rounded-full px-3 py-2.5"
      >
        <button onClick={player.prev} className="grid h-9 w-9 place-items-center rounded-full text-[var(--dim)] transition-colors hover:text-[var(--ink)]" aria-label="Previous">
          <PrevIcon size={17} />
        </button>
        <button
          onClick={player.toggle}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-black"
          style={{ background: "linear-gradient(145deg,var(--acc0),var(--acc1))" }}
          aria-label={player.playing ? "Pause" : "Play"}
        >
          {player.playing ? <PauseIcon size={19} /> : <PlayIcon size={19} className="ml-0.5" />}
        </button>
        <button onClick={player.next} className="grid h-9 w-9 place-items-center rounded-full text-[var(--dim)] transition-colors hover:text-[var(--ink)]" aria-label="Next">
          <NextIcon size={17} />
        </button>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[12.5px] font-bold text-[var(--ink)]">{track?.title ?? "—"}</p>
          <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/12">
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "linear-gradient(90deg,var(--acc0),var(--acc1))" }} />
          </div>
        </div>
        <span className="shrink-0 pr-1 font-tmono text-[10px] tabular-nums text-[var(--dim)]">{fmtTime(player.time)}</span>
      </motion.div>
    </div>
  );
}
