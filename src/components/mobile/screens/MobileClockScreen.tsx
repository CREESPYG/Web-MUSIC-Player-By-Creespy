import { useEffect, useState } from "react";
import { useClock } from "../../../hooks/useClock";
import type { WeatherNow } from "../../../lib/weather";
import { WMO } from "../../../lib/weather";
import type { PlayerApi } from "../../Controls";
import { WeatherIcon } from "../../WeatherIcon";
import { ClockOnlyIcon, SunIcon, RefreshIcon } from "../../UiIcons";

import { useSleepTimer } from "../../../hooks/useSleepTimer";

interface Props {
  weather: WeatherNow | null;
  wLoading: boolean;
  onRefreshWeather: () => void;
  player: PlayerApi;
  onToast: (msg: string) => void;
  showSeconds?: boolean;
  clock24?: boolean;
}

const PRESETS = [
  { label: "15 min", seconds: 15 * 60 },
  { label: "30 min", seconds: 30 * 60 },
  { label: "45 min", seconds: 45 * 60 },
  { label: "60 min", seconds: 60 * 60 },
  { label: "90 min", seconds: 90 * 60 },
  { label: "2 hrs", seconds: 120 * 60 },
  { label: "3 hrs", seconds: 180 * 60 },
  { label: "End of night", seconds: 480 * 60 },
];

function useOrientation() {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    typeof window !== "undefined" && window.innerWidth > window.innerHeight ? "landscape" : "portrait"
  );

  useEffect(() => {
    const check = () => {
      setOrientation(window.innerWidth > window.innerHeight ? "landscape" : "portrait");
    };
    let orientTimer = 0;
    const onOrient = () => { orientTimer = window.setTimeout(check, 100); };
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", onOrient);
    return () => {
      window.clearTimeout(orientTimer);
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);

  return orientation;
}

export function MobileClockScreen({
  weather,
  wLoading,
  onRefreshWeather,
  player,
  onToast,
  showSeconds = true,
  clock24 = false,
}: Props) {
  const clock = useClock();
  const { sleepSeconds, setTimer, cancelTimer, formatted: formattedSleep } = useSleepTimer(player, onToast);
  const orientation = useOrientation();
  const isLandscape = orientation === "landscape";

  const displayHour = clock24 ? String(clock.h24).padStart(2, "0") : clock.hh;

  const ClockDisplay = ({ compact }: { compact?: boolean }) => (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "pt-1" : "pt-3"}`}>
      <span className="font-tmono text-[10px] uppercase tracking-[0.24em] text-[var(--dim)]">
        {clock.greeting}
      </span>
      <div className={`mt-1 flex items-baseline justify-center gap-1 font-display font-black tracking-tight ${compact ? "" : ""}`}>
        <span className={`${compact ? "text-4xl" : "text-6xl sm:text-7xl"} text-[var(--ink)]`}>{displayHour}</span>
        <span className={`animate-pulse ${compact ? "text-3xl" : "text-5xl"} text-[var(--acc0)]`}>:</span>
        <span className={`${compact ? "text-4xl" : "text-6xl sm:text-7xl"} text-[var(--ink)]`}>{clock.mm}</span>
        {showSeconds && (
          <>
            <span className={`animate-pulse ${compact ? "text-3xl" : "text-5xl"} text-[var(--acc0)]`}>:</span>
            <span className={`${compact ? "text-4xl" : "text-6xl sm:text-7xl"} text-[var(--ink)]`}>{clock.ss}</span>
          </>
        )}
        {!clock24 && (
          <span className={`ml-1 font-tmono ${compact ? "text-[10px]" : "text-xs"} font-semibold text-[var(--acc0)]`}>
            {clock.ampm}
          </span>
        )}
      </div>
      <span className={`mt-2 font-display ${compact ? "text-[10px]" : "text-xs"} font-semibold tracking-wide text-[var(--dim)]`}>
        {clock.dateLong}
      </span>
    </div>
  );

  const WeatherWidget = ({ compact }: { compact?: boolean }) => (
    <div className={`rounded-2xl border border-white/8 bg-white/[0.02] shadow-lg backdrop-blur-xl ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`grid place-items-center rounded-xl bg-white/5 text-[var(--acc0)] ${compact ? "h-9 w-9" : "h-11 w-11"}`}>
            {weather ? (
              <WeatherIcon code={weather.code} isDay={weather.isDay} size={compact ? 20 : 24} />
            ) : (
              <SunIcon size={compact ? 20 : 24} />
            )}
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className={`font-display font-bold text-[var(--ink)] ${compact ? "text-base" : "text-lg"}`}>
                {weather ? `${Math.round(weather.tempC)}°C` : "--°"}
              </span>
              <span className="text-xs font-medium text-[var(--dim)]">
                {weather ? WMO[weather.code]?.label || "Clear" : "Updating…"}
              </span>
            </div>
            <p className="font-tmono text-[10px] text-[var(--dim)]/70">
              {weather?.place || "Local Forecast"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefreshWeather}
          disabled={wLoading}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/8 text-[var(--dim)] hover:text-white disabled:opacity-40 active:scale-90"
          aria-label="Refresh weather"
        >
          <RefreshIcon size={14} className={wLoading ? "animate-spin" : ""} />
        </button>
      </div>
    </div>
  );

  const SleepTimerModule = ({ compact }: { compact?: boolean }) => (
    <div className={`rounded-2xl border border-white/8 bg-white/[0.02] ${compact ? "p-3" : "p-4"}`}>
      <div className={`flex items-center justify-between ${compact ? "mb-2" : "mb-3"}`}>
        <div className="flex items-center gap-2">
          <ClockOnlyIcon size={16} className="text-[var(--acc0)]" />
          <h4 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
            Sleep Timer
          </h4>
        </div>
        {sleepSeconds !== null && (
          <span className="font-tmono text-xs font-bold text-[var(--acc0)]">
            {formattedSleep}
          </span>
        )}
      </div>

      {sleepSeconds !== null ? (
        <div className="flex flex-col gap-2">
          {!compact && (
            <p className="text-[10px] text-[var(--dim)]">
              Playback will automatically stop when the timer reaches zero.
            </p>
          )}
          <button
            type="button"
            onClick={() => { cancelTimer(); onToast("Sleep timer cancelled"); }}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 font-display text-xs font-semibold text-[var(--dim)] hover:text-white active:scale-98"
          >
            Cancel Sleep Timer
          </button>
        </div>
      ) : (
        <div className={`grid ${compact ? "grid-cols-4" : "grid-cols-4"} gap-2`}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setTimer(p.seconds); onToast(`Sleep timer set to ${p.label}`); }}
              className={`rounded-xl border border-white/8 bg-white/5 font-display font-bold text-[var(--ink)] transition-colors hover:border-[var(--acc0)] hover:text-[var(--acc0)] active:scale-95 ${compact ? "px-1 py-1.5 text-[9px]" : "py-2 text-[10px]"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Landscape layout: side-by-side
  if (isLandscape) {
    return (
      <div className="scroll-slim flex h-full flex-row gap-4 overflow-y-auto px-4 py-3 pb-8">
        {/* Left: Clock + Weather */}
        <div className="flex flex-1 flex-col gap-3">
          <ClockDisplay compact />
          <WeatherWidget compact />
        </div>
        {/* Right: Sleep Timer + Quick Info */}
        <div className="flex flex-1 flex-col gap-3">
          <SleepTimerModule compact />
          {/* Now Playing Mini */}
          <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--acc0)]/15 text-[var(--acc0)]">
              {player.playing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-bold text-[var(--ink)]">
                {player.playing ? "Playing" : "Paused"}
              </p>
              <p className="truncate text-[9px] text-[var(--dim)]">Tap Music tab to control</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Portrait layout: stacked sections
  return (
    <div className="scroll-slim flex h-full flex-col justify-between overflow-y-auto px-4 py-4 pb-8">
      <ClockDisplay />
      <div className="mt-5 flex flex-col gap-4">
        <WeatherWidget />
        <SleepTimerModule />
      </div>
    </div>
  );
}
