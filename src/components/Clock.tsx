import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useClock } from "../hooks/useClock";
import { WMO, toUnit, unitLabel, ago, type WeatherNow } from "../lib/weather";
import { WeatherIcon } from "./WeatherIcon";
import type { PlayerApi } from "../hooks/usePlayer";
import { fmtTime } from "../lib/color";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons";
import { LocationIcon, ExpandIcon } from "./UiIcons";
import { DigitFlipper } from "./DigitFlipper";

/* ---------------- compact clock + weather tile ---------------- */
export function ClockCard({
  weather,
  loading,
  unit,
  clock24,
  showSeconds,
  onRefresh,
  onExpand,
}: {
  weather: WeatherNow | null;
  loading: boolean;
  unit: "c" | "f";
  clock24: boolean;
  showSeconds: boolean;
  onRefresh: () => void;
  onExpand: () => void;
}) {
  const c = useClock();
  const time = clock24 ? `${String(c.h24).padStart(2, "0")}:${c.mm}` : `${c.hh}:${c.mm}`;

  return (
    <div className="relative overflow-hidden p-4 md:p-5 rounded-[28px] border border-white/8 bg-[var(--bg1,#161e28)] select-none shadow-none">
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-tmono text-[9.5px] uppercase tracking-[0.28em] text-[var(--dim)]">{c.greeting}</p>
          <div className="mt-1 flex items-baseline gap-1.5 font-display">
            <DigitFlipper
              value={time}
              className="text-[36px] font-extrabold leading-none tabular-nums text-[var(--ink)]"
            />
            {showSeconds && (
              <span className="flex items-baseline text-base font-bold tabular-nums text-[var(--acc0)]">
                <span>:</span>
                <DigitFlipper value={c.ss} className="text-[var(--acc0)]" />
              </span>
            )}
            {!clock24 && <span className="font-tmono text-[11px] text-[var(--dim)]">{c.ampm}</span>}
          </div>
          <p className="mt-1 truncate text-[13px] font-semibold text-[var(--dim)]">{c.dateLong}</p>
        </div>

        <div className="shrink-0 text-right">
          {loading && !weather ? (
            <div className="flex flex-col items-end gap-1.5 pt-1">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-[var(--acc0)]" />
              <span className="font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--dim)]">locating</span>
            </div>
          ) : weather ? (
            <>
              <div className="flex items-center justify-end gap-1 text-[var(--acc0)]">
                <WeatherIcon code={weather.code} isDay={weather.isDay} size={34} />
                <span className="font-display text-[26px] font-extrabold leading-none tabular-nums text-[var(--ink)]">
                  {Math.round(toUnit(weather.tempC, unit))}
                  <span className="text-sm">{unitLabel(unit)}</span>
                </span>
              </div>
              <p className="mt-1 truncate text-[12px] font-semibold text-[var(--dim)]">
                {WMO[weather.code]?.label}
              </p>
              <div className="mt-0.5 flex items-center justify-end gap-2">
                <span className="flex items-center gap-1 font-tmono text-[8px] uppercase tracking-[0.14em] text-[var(--acc2)]">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--acc2)]" />
                  live {ago(weather.updatedAt)}s
                </span>
                <button
                  onClick={onRefresh}
                  title={`Refresh weather — ${weather.source === "gps" ? `GPS ±${weather.accuracyM ?? "?"} m` : weather.source === "pinned" ? "pinned city" : weather.source === "ip" ? "IP estimate" : "default city"}`}
                  className="flex items-center gap-1 font-tmono text-[9px] uppercase tracking-[0.16em] text-[var(--dim)]/80 transition-colors hover:text-[var(--acc0)]"
                >
                  <LocationIcon size={10} />
                  <span className="max-w-[100px] truncate">{weather.place}</span>
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={onRefresh}
              className="glass-soft rounded-lg px-2.5 py-1.5 font-tmono text-[9.5px] uppercase tracking-[0.16em] text-[var(--dim)]"
            >
              retry
            </button>
          )}
        </div>
      </div>

      <button
        onClick={onExpand}
        className="relative mt-3 flex w-full items-center justify-between rounded-[var(--radius-s)] border border-white/10 bg-white/5 px-3 py-2 font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--dim)] transition-colors hover:border-[var(--acc0)]/40 hover:text-[var(--acc0)]"
      >
        open clock view
        <span className="kbd">C</span>
      </button>
    </div>
  );
}

/* ---------------- full-screen clock view ---------------- */
export function ClockView({
  open,
  onClose,
  weather,
  loading,
  unit,
  clock24,
  showSeconds,
  trackTitle,
  player,
}: {
  open: boolean;
  onClose: () => void;
  weather: WeatherNow | null;
  loading: boolean;
  unit: "c" | "f";
  clock24: boolean;
  showSeconds: boolean;
  trackTitle: string;
  player: PlayerApi;
}) {
  const c = useClock();
  const big = clock24 ? `${String(c.h24).padStart(2, "0")}:${c.mm}` : `${c.hh}:${c.mm}`;

  const days = useMemo(
    () =>
      weather?.daily.slice(1, 4).map((d, i) => ({
        ...d,
        label: new Date(Date.now() + (i + 1) * 86400000).toLocaleDateString(undefined, { weekday: "short" }),
      })) ?? [],
    [weather]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto px-5 py-10"
          style={{ background: "rgba(3,7,14,0.6)", backdropFilter: "blur(26px)" }}
        >
          <div className="absolute right-4 top-4 flex items-center gap-2 md:right-5 md:top-5">
            <button
              onClick={() => {
                const el = document.documentElement;
                if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
                else el.requestFullscreen?.().catch(() => {});
              }}
              title="Toggle fullscreen"
              aria-label="Toggle fullscreen"
              className="glass grid h-10 w-10 place-items-center rounded-full text-[var(--dim)] transition-colors hover:text-[var(--acc0)]"
            >
              <ExpandIcon size={16} />
            </button>
            <button
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
                onClose();
              }}
              className="glass flex items-center gap-2 rounded-full px-4 py-2.5 font-tmono text-[10px] uppercase tracking-[0.2em] text-[var(--dim)] transition-colors hover:text-[var(--acc0)]"
            >
              back <span className="kbd">C</span>
            </button>
          </div>

          <motion.div
            initial={{ y: 26, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full max-w-[900px] flex-col items-center text-center"
          >
            <p className="font-tmono text-[11px] md:text-xs uppercase tracking-[0.45em] text-[var(--acc0)] drop-shadow">{c.greeting}</p>

            <div className="mt-2 flex items-baseline justify-center font-display text-[22vw] sm:text-[20vw] md:text-[180px] lg:text-[230px] xl:text-[270px] font-black leading-none drop-shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              <DigitFlipper
                value={big}
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

            <p className="mt-1 text-lg font-semibold text-[var(--dim)] md:text-xl drop-shadow-sm">{c.dateLong}</p>

            <div className="mt-8 flex flex-wrap items-stretch justify-center gap-3">
              {loading && !weather ? (
                <span className="glass rounded-[var(--radius)] px-6 py-5 font-tmono text-[10px] uppercase tracking-[0.28em] text-[var(--dim)]">
                  finding your sky…
                </span>
              ) : weather ? (
                <>
                  <div className="glass flex items-center gap-4 rounded-[var(--radius)] px-5 py-4 text-left">
                    <span className="text-[var(--acc0)]">
                      <WeatherIcon code={weather.code} isDay={weather.isDay} size={46} />
                    </span>
                    <div>
                      <p className="font-display text-3xl font-extrabold leading-none tabular-nums text-[var(--ink)]">
                        {Math.round(toUnit(weather.tempC, unit))}
                        {unitLabel(unit)}
                      </p>
                      <p className="mt-1 text-[12.5px] font-semibold text-[var(--dim)]">
                        {WMO[weather.code]?.label} · feels {Math.round(toUnit(weather.feelsC, unit))}
                        {unitLabel(unit)}
                      </p>
                      <p className="mt-1.5 flex items-center gap-1 font-tmono text-[9.5px] uppercase tracking-[0.18em] text-[var(--dim)]/80">
                        <LocationIcon size={11} />
                        <span className="max-w-[160px] truncate">
                          {weather.place}
                          {weather.region ? `, ${weather.region}` : ""}
                        </span>
                        <span className="rounded-full border border-white/15 px-1.5 py-px text-[8px]">
                          {weather.source === "gps" ? "gps" : weather.source === "ip" ? "ip geo" : "default"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="glass flex items-center gap-5 rounded-[var(--radius)] px-5 py-4">
                    {[
                      ["humidity", `${weather.humidity}%`],
                      ["wind", `${Math.round(weather.wind)} km/h`],
                      ["hi / lo", `${Math.round(toUnit(weather.daily[0]?.max ?? weather.tempC, unit))}° / ${Math.round(toUnit(weather.daily[0]?.min ?? weather.tempC, unit))}°`],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="font-tmono text-[8.5px] uppercase tracking-[0.22em] text-[var(--dim)]">{k}</p>
                        <p className="mt-0.5 font-display text-base font-bold tabular-nums text-[var(--ink)]">{v}</p>
                      </div>
                    ))}
                  </div>

                  {days.length > 0 && (
                    <div className="glass flex items-center gap-4 rounded-[var(--radius)] px-5 py-4">
                      {days.map((d) => (
                        <div key={d.label} className="flex flex-col items-center gap-1">
                          <span className="font-tmono text-[8.5px] uppercase tracking-[0.18em] text-[var(--dim)]">
                            {d.label}
                          </span>
                          <span className="text-[var(--acc1)]">
                            <WeatherIcon code={d.code} isDay size={22} />
                          </span>
                          <span className="font-tmono text-[10.5px] tabular-nums text-[var(--ink)]">
                            {Math.round(toUnit(d.max, unit))}°
                            <span className="text-[var(--dim)]">/{Math.round(toUnit(d.min, unit))}°</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <span className="glass rounded-[var(--radius)] px-6 py-5 font-tmono text-[10px] uppercase tracking-[0.24em] text-[var(--dim)]">
                  weather unavailable offline
                </span>
              )}
            </div>

            {/* floating mini player */}
            <div className="glass mt-8 flex w-full max-w-[540px] items-center gap-2.5 rounded-full px-3 py-2.5">
              <button onClick={player.prev} className="grid h-9 w-9 place-items-center rounded-full text-[var(--dim)] hover:text-white" aria-label="Previous">
                <PrevIcon size={18} />
              </button>
              <button
                onClick={player.toggle}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-black"
                style={{ background: "linear-gradient(145deg, var(--acc0), var(--acc1))" }}
                aria-label={player.playing ? "Pause" : "Play"}
              >
                {player.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} className="ml-0.5" />}
              </button>
              <button onClick={player.next} className="grid h-9 w-9 place-items-center rounded-full text-[var(--dim)] hover:text-white" aria-label="Next">
                <NextIcon size={18} />
              </button>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[12.5px] font-bold text-[var(--ink)]">{trackTitle}</p>
                <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/12">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${player.duration ? Math.min(100, (player.time / player.duration) * 100) : 0}%`,
                      background: "linear-gradient(90deg,var(--acc0),var(--acc1))",
                    }}
                  />
                </div>
              </div>
              <span className="shrink-0 pr-1 font-tmono text-[10.5px] tabular-nums text-[var(--dim)]">
                {fmtTime(player.time)}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
