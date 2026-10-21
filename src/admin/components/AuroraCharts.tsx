import React from "react";

interface ActivityChartProps {
  data?: { day: string; count: number }[];
  height?: number;
}

export const ActivityTrendChart: React.FC<ActivityChartProps> = ({ data, height = 180 }) => {
  // Generate sample 14-day data if none provided
  const points =
    data && data.length > 0
      ? data
      : Array.from({ length: 14 }).map((_, i) => {
          const d = new Date(Date.now() - (13 - i) * 864e5);
          return {
            day: `${d.getMonth() + 1}/${d.getDate()}`,
            count: 12 + Math.floor(Math.sin(i * 0.8) * 8 + i * 1.5 + (i % 3) * 4),
          };
        });

  const maxVal = Math.max(...points.map((p) => p.count), 20);
  const minVal = 0;
  const width = 600;
  const paddingX = 40;
  const paddingY = 25;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  // Calculate coordinates
  const coords = points.map((p, idx) => {
    const x = paddingX + (idx / (points.length - 1)) * chartW;
    const y = paddingY + chartH - ((p.count - minVal) / (maxVal - minVal)) * chartH;
    return { x, y, ...p };
  });

  // Construct SVG path with smooth curve
  const pathD = coords.reduce((acc, curr, i, arr) => {
    if (i === 0) return `M ${curr.x},${curr.y}`;
    const prev = arr[i - 1];
    const cx = (prev.x + curr.x) / 2;
    return `${acc} C ${cx},${prev.y} ${cx},${curr.y} ${curr.x},${curr.y}`;
  }, "");

  // Area under curve path
  const areaD = `${pathD} L ${coords[coords.length - 1].x},${height - paddingY} L ${coords[0].x},${height - paddingY} Z`;

  return (
    <div className="admin-chart-wrap" style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", overflow: "visible" }}
        role="img"
        aria-label="Activity trend chart"
      >
        <defs>
          <linearGradient id="auroraAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3cc6ff" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#ff3ea5" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#2dffe0" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="auroraLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3cc6ff" />
            <stop offset="50%" stopColor="#ff3ea5" />
            <stop offset="100%" stopColor="#2dffe0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.33, 0.66, 1].map((ratio, i) => {
          const y = paddingY + chartH * ratio;
          return (
            <g key={i}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="rgba(60, 198, 255, 0.12)"
                strokeDasharray="4 4"
              />
              <text
                x={paddingX - 8}
                y={y + 3}
                fill="#6e8aa8"
                fontSize="10"
                fontFamily="var(--font-tmono)"
                textAnchor="end"
              >
                {Math.round(maxVal - ratio * (maxVal - minVal))}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#auroraAreaGrad)" />

        {/* Gradient line */}
        <path d={pathD} fill="none" stroke="url(#auroraLineGrad)" strokeWidth="3" strokeLinecap="round" />

        {/* Data points */}
        {coords.map((c, i) => (
          <g key={i} className="admin-chart-point">
            <circle cx={c.x} cy={c.y} r="4" fill="#040913" stroke="#3cc6ff" strokeWidth="2" />
            <title>{`${c.day}: ${c.count} creations & plays`}</title>
            {i % 2 === 0 && (
              <text
                x={c.x}
                y={height - 6}
                fill="#8296b6"
                fontSize="9"
                fontFamily="var(--font-tmono)"
                textAnchor="middle"
              >
                {c.day}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

interface PlatformDonutProps {
  platforms: { platform: string; count: number; percentage: number }[];
}

export const PlatformDonutChart: React.FC<PlatformDonutProps> = ({ platforms }) => {
  const colors: Record<string, string> = {
    YouTube: "#ff3e55",
    JioSaavn: "#2dffe0",
    Spotify: "#1db954",
    SoundCloud: "#ff7700",
    Other: "#3cc6ff",
  };

  const total = platforms.reduce((acc, p) => acc + p.count, 0) || 1;
  let accumulatedAngle = 0;

  const size = 180;
  const center = size / 2;
  const radius = 64;
  const strokeWidth = 26;

  const slices = platforms.map((p) => {
    const fraction = p.count / total;
    const strokeDasharray = `${fraction * 2 * Math.PI * radius} ${2 * Math.PI * radius}`;
    const strokeDashoffset = -accumulatedAngle * 2 * Math.PI * radius;
    accumulatedAngle += fraction;
    return {
      ...p,
      strokeDasharray,
      strokeDashoffset,
      color: colors[p.platform] || "#a0aec0",
    };
  });

  return (
    <div className="admin-donut-container" style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth={strokeWidth}
          />
          {slices.map((slice, i) => (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={slice.strokeDasharray}
              strokeDashoffset={slice.strokeDashoffset}
              transform={`rotate(-90 ${center} ${center})`}
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          ))}
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span style={{ fontFamily: "var(--font-tmono)", fontSize: "20px", fontWeight: 800, color: "#fff" }}>
            {total}
          </span>
          <span style={{ fontSize: "10px", color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Tracks
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "160px" }}>
        {platforms.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", fontSize: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: colors[p.platform] || "#a0aec0" }} />
              <span style={{ fontWeight: 600, color: "var(--admin-text)" }}>{p.platform}</span>
            </div>
            <span style={{ fontFamily: "var(--font-tmono)", color: "var(--admin-muted)" }}>
              {p.count} <span style={{ color: "#3cc6ff" }}>({p.percentage}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ResolverQualityBar: React.FC<{ byResolver?: Record<string, number> }> = ({ byResolver }) => {
  const data = byResolver || { EXACT: 520, HIGH: 65, MEDIUM: 30, UNRESOLVED: 15 };
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;

  const statusColors: Record<string, string> = {
    EXACT: "#4be0a4",
    HIGH: "#3cc6ff",
    MEDIUM: "#ffb84d",
    LOW: "#ff8c42",
    UNRESOLVED: "#ff5d6c",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", height: "14px", borderRadius: "2px", overflow: "hidden", background: "rgba(0,0,0,0.4)", border: "1px solid var(--admin-border)" }}>
        {Object.entries(data).map(([status, count]) => {
          const widthPct = (count / total) * 100;
          return (
            <div
              key={status}
              title={`${status}: ${count} tracks (${Math.round(widthPct)}%)`}
              style={{
                width: `${widthPct}%`,
                background: statusColors[status] || "#718096",
                transition: "width 0.4s ease",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 18px", fontSize: "11px", fontFamily: "var(--font-tmono)" }}>
        {Object.entries(data).map(([status, count]) => (
          <div key={status} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: statusColors[status] || "#718096" }} />
            <span style={{ color: "#cbd5e1" }}>{status}:</span>
            <span style={{ fontWeight: 700, color: statusColors[status] }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
