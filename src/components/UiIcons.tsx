import React from "react";

interface P {
  size?: number;
  className?: string;
}

const svg = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const PlusIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M12 5v14M5 12h14" strokeWidth={2.3} />
  </svg>
);

export const CloseIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="m6 6 12 12M18 6 6 18" strokeWidth={2.2} />
  </svg>
);
export const XIcon = CloseIcon;

export const SlidersIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </svg>
);
export const SettingsIcon = SlidersIcon;

export const LinkIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
    <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.2-1.2" />
  </svg>
);

export const TrashIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M4 7h16M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.9 12c.1.8.7 1.4 1.5 1.4h6.2c.8 0 1.4-.6 1.5-1.4l.9-12" />
  </svg>
);

export const UploadIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 15v3.2A1.8 1.8 0 0 0 5.8 20h12.4A1.8 1.8 0 0 0 20 18.2V15" />
  </svg>
);

export const LyricsIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="8" y1="8" x2="16" y2="8" strokeWidth={1.6} />
    <line x1="8" y1="12" x2="14" y2="12" strokeWidth={1.6} />
  </svg>
);

export const ImageIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2.4" />
    <circle cx="9" cy="10.5" r="1.7" />
    <path d="m4 17 4.5-4.2 3.4 3.1 3-2.6L20 17.6" />
  </svg>
);

export const DownloadIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" />
    <path d="M4 15v3.2A1.8 1.8 0 0 0 5.8 20h12.4A1.8 1.8 0 0 0 20 18.2V15" />
  </svg>
);
export const ExportIcon = DownloadIcon;

export const ResetIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4.5V10h-5.4" />
  </svg>
);
export const RefreshCwIcon = ResetIcon;
export const RestartIcon = ResetIcon;

export const LocationIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const CheckIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="m5 12.8 4.4 4.2L19 6.8" strokeWidth={2.4} />
  </svg>
);

export const SparkIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M12 3.2l1.7 4.9 4.9 1.7-4.9 1.7L12 16.4l-1.7-4.9L5.4 9.8l4.9-1.7L12 3.2Z" fill="currentColor" stroke="none" />
    <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" fill="currentColor" stroke="none" />
  </svg>
);
export const SparklesIcon = SparkIcon;

export const SearchIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" strokeWidth={2.2} />
  </svg>
);

export const PinIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M15 3.5 20.5 9M17.8 6.2 11 13v4l-3-3H4l7.5-7.5" />
    <path d="m5 19 4-4" />
  </svg>
);

export const TimerIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M9 2.5h6" />
    <path d="M12 13V8.5" />
    <circle cx="12" cy="14" r="7.5" />
    <path d="m18.5 7.5 1.4-1.4" />
  </svg>
);

export const PlayIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M7 4.8v14.4c0 .9 1 1.5 1.8 1L20.2 13c.8-.5.8-1.6 0-2L8.8 3.8C8 3.3 7 3.9 7 4.8Z" fill="currentColor" stroke="none" />
  </svg>
);
export const PlayFillIcon = PlayIcon;

export const PauseIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <rect x="6" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" stroke="none" />
  </svg>
);
export const PauseFillIcon = PauseIcon;

export const SkipForwardIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
    <line x1="19" y1="5" x2="19" y2="19" strokeWidth={2.4} />
  </svg>
);

export const SkipBackIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none" />
    <line x1="5" y1="19" x2="5" y2="5" strokeWidth={2.4} />
  </svg>
);

export const Volume2Icon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

export const VolumeXIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

export const DiscIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const DiscOnlyIcon = DiscIcon;

export const RadioTowerIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
    <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
  </svg>
);

export const HeadphonesIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </svg>
);

export const LayoutIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

export const ClockOnlyIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const ListMusicIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M21 15V6" />
    <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
    <path d="M12 12H3" />
    <path d="M16 6H3" />
    <path d="M12 18H3" />
  </svg>
);

export const FolderMusicIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    <circle cx="12" cy="13" r="2" />
    <path d="M14 13V9" />
  </svg>
);

export const HistoryIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <polyline points="12 7 12 12 15 15" />
  </svg>
);

export const InfoIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export const PaletteIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2Z" />
  </svg>
);

export const EyeIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const SunIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

export const MoonIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const CloudIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
);

export const RefreshIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
  </svg>
);

export const WifiIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
  </svg>
);

export const SignalIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8" strokeWidth={2.2} />
  </svg>
);

export const MenuIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

export const ShareIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

export const ExternalLinkIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
export const ExpandIcon = ExternalLinkIcon;

export const MusicNoteIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export const HeartIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

export const BoltIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none" />
  </svg>
);

export const SendIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

export const CheckboxIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
  </svg>
);

export const CheckboxDoneIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" opacity={0.15} />
    <path d="m7 12.5 3.5 3.5 6.5-7" strokeWidth={2.4} />
  </svg>
);

export const TasksIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.2} />
  </svg>
);

export const ChatIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const CopyIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

export const CrownIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
  </svg>
);

export const GlobeIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export const LockIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const GroupIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const NotificationsIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

export const YouTubeMark = ({ size = 18, className }: P) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

export const Switch = ({
  checked,
  on,
  onChange,
  className,
}: {
  checked?: boolean;
  on?: boolean;
  onChange: (c: boolean) => void;
  className?: string;
  label?: string;
}) => {
  const isChecked = typeof on !== "undefined" ? on : !!checked;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      onClick={() => onChange(!isChecked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        isChecked ? "bg-[var(--acc0)]" : "bg-white/20"
      } ${className || ""}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
          isChecked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
};

export const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 px-1 font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--dim)]">{children}</p>
);

export const SliderRow = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  left,
  right,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  left?: string;
  right?: string;
  format?: (v: number) => string;
}) => (
  <div className="mb-3 space-y-1">
    <div className="flex items-center justify-between text-[11.5px]">
      <span className="text-[var(--ink)]">{label}</span>
      <span className="font-tmono text-[10px] text-[var(--dim)]">{format ? format(value) : value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--acc0)]"
    />
    {(left || right) && (
      <div className="flex justify-between font-tmono text-[8px] uppercase tracking-wider text-[var(--dim)]/60">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    )}
  </div>
);

export const Segmented = ({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: any) => void;
  ariaLabel?: string;
}) => (
  <div className="flex rounded-xl bg-black/30 p-1 border border-white/5" role="radiogroup" aria-label={ariaLabel}>
    {options.map((opt) => (
      <button
        key={opt.v}
        type="button"
        role="radio"
        aria-checked={value === opt.v}
        onClick={() => onChange(opt.v)}
        className={`flex-1 rounded-lg py-1.5 text-center text-xs font-medium transition-all ${
          value === opt.v
            ? "bg-white/15 text-[var(--ink)] font-semibold shadow-sm"
            : "text-[var(--dim)] hover:text-[var(--ink)]"
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export const MicIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

export const MicOffIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <line x1="2" x2="22" y1="2" y2="22" strokeWidth={2.2} />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

export const DeafIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <line x1="2" x2="22" y1="2" y2="22" strokeWidth={2.2} />
    <path d="M3 14h3l4 4V6L6.5 9H3v5Z" />
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03" />
  </svg>
);

export const ShieldIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const PhoneOffIcon = ({ size, className }: P) => (
  <svg {...svg(size)} className={className}>
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.11-8.69A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="2" x2="22" y1="2" y2="22" strokeWidth={2.2} />
  </svg>
);
