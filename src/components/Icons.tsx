interface IconProps {
  size?: number;
  className?: string;
}

const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const PlayIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M7 4.8v14.4c0 .9 1 1.5 1.8 1L20.2 13c.8-.5.8-1.6 0-2L8.8 3.8C8 3.3 7 3.9 7 4.8Z" fill="currentColor" stroke="none" />
  </svg>
);

export const PauseIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const PrevIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M18.5 5.6v12.8c0 .8-.9 1.3-1.6.9L7.8 13c-.7-.4-.7-1.5 0-1.9l9.1-6.4c.7-.5 1.6 0 1.6.9Z" fill="currentColor" stroke="none" />
    <path d="M5.5 5v14" strokeWidth={2.4} />
  </svg>
);

export const NextIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5.5 5.6v12.8c0 .8.9 1.3 1.6.9l9.1-6.3c.7-.4.7-1.5 0-1.9L7.1 4.7c-.7-.5-1.6 0-1.6.9Z" fill="currentColor" stroke="none" />
    <path d="M18.5 5v14" strokeWidth={2.4} />
  </svg>
);

export const ShuffleIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 6.5h2.6c1.3 0 2.5.6 3.3 1.6l4.2 5.8a4.1 4.1 0 0 0 3.3 1.6H21" />
    <path d="M3 17.5h2.6c1.3 0 2.5-.6 3.3-1.6l.8-1.1M13.4 8l.7-1a4.1 4.1 0 0 1 3.3-1.5H21" />
    <path d="m18.5 4 2.5 2.5L18.5 9M18.5 15l2.5 2.5-2.5 2.5" />
  </svg>
);

export const RepeatIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M17 2.5 20 5.5l-3 3" />
    <path d="M4 11V9.5a4 4 0 0 1 4-4h12" />
    <path d="M7 21.5 4 18.5l3-3" />
    <path d="M20 13v1.5a4 4 0 0 1-4 4H4" />
  </svg>
);

export const RepeatOneIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M17 2.5 20 5.5l-3 3" />
    <path d="M4 11V9.5a4 4 0 0 1 4-4h12" />
    <path d="M7 21.5 4 18.5l3-3" />
    <path d="M20 13v1.5a4 4 0 0 1-4 4H4" />
    <path d="M11 9.8l1.8-1.1v6.6" strokeWidth={2.1} />
  </svg>
);

export const VolumeIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 9.5v5h3.2L12 18.7V5.3L7.2 9.5H4Z" fill="currentColor" stroke="none" />
    <path d="M15.5 8.7a4.6 4.6 0 0 1 0 6.6M18.2 6a8.3 8.3 0 0 1 0 12" />
  </svg>
);

export const MuteIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 9.5v5h3.2L12 18.7V5.3L7.2 9.5H4Z" fill="currentColor" stroke="none" />
    <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
  </svg>
);

export const HeartIcon = ({ size, className, filled }: IconProps & { filled?: boolean }) => (
  <svg {...base(size)} className={className}>
    <path
      d="M12 20.3S3.5 15.4 3.5 9.6C3.5 6.7 5.7 4.5 8.4 4.5c1.5 0 2.9.7 3.6 1.9.7-1.2 2.1-1.9 3.6-1.9 2.7 0 4.9 2.2 4.9 5.1 0 5.8-8.5 10.7-8.5 10.7Z"
      fill={filled ? "currentColor" : "none"}
    />
  </svg>
);

export const UsersIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.8 19.4c.7-3 3.2-4.6 6.2-4.6s5.5 1.6 6.2 4.6" />
    <path d="M16 5.2a3.4 3.4 0 0 1 0 5.9M17.8 14.9c1.8.6 3 1.9 3.4 3.9" />
  </svg>
);

export const DropIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.2s6.4 6.7 6.4 11a6.4 6.4 0 0 1-12.8 0c0-4.3 6.4-11 6.4-11Z" />
    <path d="M9.2 13.8a2.9 2.9 0 0 0 2 2.7" />
  </svg>
);

export const SparkIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.8 5.8l2.6 2.6M15.6 15.6l2.6 2.6M18.2 5.8l-2.6 2.6M8.4 15.6l-2.6 2.6" />
  </svg>
);

export const BoltIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z" fill="currentColor" stroke="none" />
  </svg>
);

/** Logo mark — a droplet carrying a sound wave. */
export const LogoIcon = ({ size = 26, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
    <path
      d="M16 2.8s9.4 9.8 9.4 16.4a9.4 9.4 0 0 1-18.8 0C6.6 12.6 16 2.8 16 2.8Z"
      fill="url(#lg)"
      stroke="rgba(255,255,255,.4)"
      strokeWidth="1.1"
    />
    <path d="M10.4 19.4h1.7l1.4-3.6 2 6.2 1.7-4.4 1 1.8h3.4" stroke="#0b1220" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="lg" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--acc0)" />
        <stop offset="1" stopColor="var(--acc2)" />
      </linearGradient>
    </defs>
  </svg>
);
