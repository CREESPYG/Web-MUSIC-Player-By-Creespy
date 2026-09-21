interface Props {
  code: number;
  isDay: boolean;
  size?: number;
  className?: string;
}

/** Hand-drawn SVG weather glyphs, tinted by CSS currentColor. */
export function WeatherIcon({ code, isDay, size = 40, className }: Props) {
  const kind =
    code === 0 || code === 1 ? (isDay ? "clear" : "night") : code === 2 ? "partly" : code === 3 ? "cloudy" : WMAP(code);

  const s = size;
  const cloud = (y = 0) => (
    <path
      d={`M17 ${28 + y}a6 6 0 0 1 .6-12 8 8 0 0 1 15.2 1.8A5.6 5.6 0 0 1 32 ${28 + y}Z`}
      fill="currentColor"
      opacity="0.95"
    />
  );

  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      {kind === "clear" && (
        <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="24" cy="24" r="7.5" fill="currentColor" stroke="none" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={24 + Math.cos(a) * 12}
                y1={24 + Math.sin(a) * 12}
                x2={24 + Math.cos(a) * 16.5}
                y2={24 + Math.sin(a) * 16.5}
              />
            );
          })}
        </g>
      )}
      {kind === "night" && (
        <>
          <path d="M29 8.5A15 15 0 1 0 39.5 30 12.5 12.5 0 0 1 29 8.5Z" fill="currentColor" />
          <circle cx="37" cy="12" r="1.6" fill="currentColor" opacity=".7" />
          <circle cx="41" cy="20" r="1.1" fill="currentColor" opacity=".5" />
        </>
      )}
      {kind === "partly" && (
        <>
          <circle cx="18" cy="17" r="6.2" fill="currentColor" opacity=".85" />
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".7">
            <line x1="18" y1="5" x2="18" y2="8" />
            <line x1="7" y1="17" x2="10" y2="17" />
            <line x1="26" y1="17" x2="29" y2="17" />
          </g>
          <g transform="translate(3 6)">{cloud(6)}</g>
        </>
      )}
      {kind === "cloudy" && (
        <>
          <g opacity=".55">{cloud(0)}</g>
          <g transform="translate(-3 -4)">{cloud(8)}</g>
        </>
      )}
      {kind === "fog" && (
        <>
          {cloud(-2)}
          <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="10" y1="35" x2="38" y2="35" />
            <line x1="14" y1="41" x2="34" y2="41" />
          </g>
        </>
      )}
      {kind === "rain" && (
        <>
          {cloud(-4)}
          <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <line x1="17" y1="32" x2="15" y2="41" />
            <line x1="25" y1="32" x2="23" y2="42" />
            <line x1="33" y1="32" x2="31" y2="39" />
          </g>
        </>
      )}
      {kind === "storm" && (
        <>
          {cloud(-4)}
          <path d="M25 30l-6 9h5l-2 7 8-11h-5l2-5Z" fill="currentColor" />
        </>
      )}
      {kind === "snow" && (
        <>
          {cloud(-4)}
          <g fill="currentColor">
            <circle cx="17" cy="36" r="2" />
            <circle cx="25" cy="40" r="2" />
            <circle cx="33" cy="35" r="2" />
          </g>
        </>
      )}
    </svg>
  );
}

function WMAP(code: number): string {
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "storm";
  if (code >= 71) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloudy";
}
