import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { THEMES, type Theme } from "../themes";
import {
  CloseIcon,
  DownloadIcon,
  ExportIcon,
  ImageIcon,
  ResetIcon,
  SearchIcon,
  SectionTitle,
  Segmented,
  SliderRow,
  Switch,
  UploadIcon,
} from "./UiIcons";
import { PlayIcon } from "./Icons";
import type { BgStyle, FxType, Settings } from "../hooks/useSettings";
import { openBgItem, prettyBytes, type BgItem, type BgLibrary } from "../lib/bgStore";
import { searchPlaces, type Place } from "../lib/weather";
import { cn } from "../utils/cn";
import { AccentColorPicker } from "./AccentColorPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  settings: Settings;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  reset: () => void;
  onFile: (f: File) => void;
  onExport: () => void;
  library: BgLibrary;
  maxUpload: number;
  busy: boolean;
  onUseItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onClearMedia: () => void;
  pinned: Place | null;
  onPin: (p: Place | null) => void;
}

const BG_OPTS: { v: BgStyle; label: string }[] = [
  { v: "dynamic", label: "Dynamic" },
  { v: "wave", label: "Wave" },
  { v: "solid", label: "Solid" },
  { v: "media", label: "Media" },
  { v: "live", label: "Live Video" },
];

const FX_OPTS: { v: FxType; label: string; desc: string }[] = [
  { v: "full", label: "Full", desc: "Orbs + Waves + Stars" },
  { v: "aurora", label: "Aurora", desc: "Northern Lights" },
  { v: "wave", label: "Wave", desc: "Sine Ribbons" },
  { v: "orbs", label: "Orbs", desc: "Cosmic Plasma" },
  { v: "particles", label: "Stardust", desc: "Drifting Stars" },
  { v: "minimal", label: "Minimal", desc: "Clean Ambient" },
];

const PRESETS = [
  { label: "Studio", url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=60" },
  { label: "Dusk", url: "https://images.unsplash.com/photo-1499346030926-9a72daac6c63?auto=format&fit=crop&w=1200&q=60" },
  { label: "Rain", url: "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=1200&q=60" },
  { label: "Neon", url: "https://images.unsplash.com/photo-1518972559570-7cc1309f3229?auto=format&fit=crop&w=1200&q=60" },
  { label: "Lo-Fi", url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=60" },
];

/** Thumbnail for a library entry — videos show their real first frame. */
function MediaThumb({ item, active, onClick, onDelete }: { item: BgItem; active: boolean; onClick: () => void; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    let made: string | null = null;
    openBgItem(item.id)
      .then((r) => {
        if (!dead && r) {
          made = r.url;
          setUrl(r.url);
        }
      })
      .catch(() => setUrl(null));
    return () => {
      dead = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [item.id]);

  return (
    <div
      className={cn(
        "group relative aspect-video overflow-hidden rounded-lg border transition-transform",
        active ? "border-[var(--acc0)] shadow-[0_0_14px_-4px_var(--acc0)]" : "border-white/14 hover:scale-[1.03]"
      )}
    >
      <button onClick={onClick} className="block h-full w-full text-left" title={item.name}>
        {url ? (
          item.kind === "video" ? (
            <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          ) : (
            <img src={url} alt={item.name} className="h-full w-full object-cover" />
          )
        ) : (
          <span className="grid h-full w-full place-items-center bg-white/6 text-[var(--dim)]">
            <ImageIcon size={15} />
          </span>
        )}
        <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1 py-px font-tmono text-[7px] uppercase tracking-[0.1em] text-white">
          {item.kind === "video" && <PlayIcon size={7} />}
          {prettyBytes(item.size)}
        </span>
      </button>
      {active && (
        <span
          className="absolute right-1 top-1 h-2 w-2 rounded-full"
          style={{ background: "var(--acc0)", boxShadow: "0 0 8px var(--acc0)" }}
        />
      )}
      <button
        onClick={onDelete}
        title="Remove from history"
        className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded bg-black/65 text-white/70 opacity-0 transition-opacity hover:text-[#ff9aa6] group-hover:opacity-100"
      >
        <CloseIcon size={11} />
      </button>
    </div>
  );
}

export function CustomizePanel({
  open,
  onClose,
  theme,
  settings,
  update,
  reset,
  onFile,
  onExport,
  library,
  maxUpload,
  busy,
  onUseItem,
  onDeleteItem,
  onClearMedia,
  pinned,
  onPin,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = window.setTimeout(async () => {
      setResults(await searchPlaces(q));
      setSearching(false);
    }, 420);
    return () => window.clearTimeout(id);
  }, [q]);

  const totalSize = library.items.reduce((s, i) => s + i.size, 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[65] bg-black/45 backdrop-blur-[2px]" />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-[66] flex h-full w-full max-w-[min(380px,100vw)] flex-col border-l border-white/10"
            style={{ background: "linear-gradient(180deg, rgba(9,14,22,0.96), rgba(6,10,17,0.985))", backdropFilter: "blur(26px)" }}
            aria-label="Customize panel"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-3.5">
              <h3 className="flex items-center gap-2.5 font-display text-[15px] font-bold tracking-[0.06em] text-[var(--ink)]">
                <span className="text-[var(--acc0)]">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
                    <circle cx="15" cy="7" r="2.2" />
                    <circle cx="9" cy="17" r="2.2" />
                  </svg>
                </span>
                Customize
              </h3>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--dim)] transition-colors hover:bg-white/8 hover:text-white" aria-label="Close customize panel">
                <CloseIcon size={17} />
              </button>
            </div>

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {/* Unified Accent Theme & Color Section */}
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle>Accent Theme & Color</SectionTitle>
                {settings.customAccent && settings.customAccent.toLowerCase() !== theme.acc0.toLowerCase() && (
                  <button
                    onClick={() => update("customAccent", null)}
                    className="font-tmono text-[9.5px] uppercase tracking-wider text-[var(--dim)] hover:text-white transition-colors underline decoration-white/30 hover:decoration-white"
                    title="Reset to pure base theme colors"
                  >
                    Reset default
                  </button>
                )}
              </div>

              {/* 4 Curated Preset Themes Grid */}
              <div className="mb-3 grid grid-cols-2 gap-2">
                {THEMES.map((t) => {
                  const isCustomActive = Boolean(
                    settings.customAccent &&
                    settings.customAccent.toLowerCase() !== theme.acc0.toLowerCase()
                  );
                  const on = !isCustomActive && t.id === theme.id;
                  return (
                    <motion.button
                      key={t.id}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        update("themeId", t.id);
                        update("customAccent", null);
                      }}
                      className="relative overflow-hidden rounded-[var(--radius-s)] border p-2.5 text-left transition-colors"
                      style={{
                        borderColor: on ? t.acc0 : "rgba(255,255,255,0.1)",
                        background: on ? `linear-gradient(135deg, ${t.acc0}22, ${t.acc1}12)` : "rgba(255,255,255,0.04)",
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        {[t.acc0, t.acc1, t.acc2].map((c) => (
                          <span key={c} className="h-3.5 w-3.5 rounded-full" style={{ background: c }} />
                        ))}
                      </span>
                      <span className="mt-2 block font-display text-[11.5px] font-bold text-[var(--ink)]">{t.name}</span>
                      <span className="block font-tmono text-[8px] uppercase tracking-[0.16em] text-[var(--dim)]">{t.tagline}</span>
                      {on && <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: t.acc0, boxShadow: `0 0 8px ${t.acc0}` }} />}
                    </motion.button>
                  );
                })}
              </div>

              {/* Custom Accent Studio */}
              <div className="mb-4">
                <AccentColorPicker
                  color={settings.customAccent || theme.acc0}
                  onChange={(hex) => update("customAccent", hex)}
                />
              </div>

              <div className="mb-4 h-px bg-white/8" />

              <SectionTitle>Glass tiles</SectionTitle>
              <SliderRow label="Border width" left="none" right="thick" min={0} max={4} step={0.5} value={settings.borderWidth} onChange={(v: number) => update("borderWidth", v)} format={(v: number) => `${v}px`} />
              <SliderRow label="Tile opacity" left="light" right="opaque" min={0.2} max={2} step={0.05} value={settings.tileOpacity} onChange={(v: number) => update("tileOpacity", v)} format={(v: number) => `${Math.round(v * 100)}%`} />
              <SliderRow label="Tile roundness" left="sharp" right="pill" min={6} max={40} value={settings.tileSize} onChange={(v: number) => update("tileSize", v)} format={(v: number) => `${v}px`} />

              <div className="mb-4 mt-4 h-px bg-white/8" />

              <SectionTitle>Visual FX</SectionTitle>
              {/* Effect Type Pill Selector */}
              <div className="mb-3 grid grid-cols-3 gap-1.5">
                {FX_OPTS.map((opt) => {
                  const on = settings.fxType === opt.v;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => update("fxType", opt.v)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border p-2 text-left transition-all",
                        on
                          ? "border-[var(--acc0)] bg-[var(--acc0)]/15 shadow-[0_0_12px_-4px_var(--acc0)] text-[var(--ink)]"
                          : "border-white/10 bg-white/4 text-[var(--dim)] hover:border-white/20 hover:text-white"
                      )}
                    >
                      <span className="font-display text-[11px] font-bold">{opt.label}</span>
                      <span className="font-tmono text-[7.5px] leading-tight opacity-75">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Visual FX Controls */}
              <SliderRow label="FX intensity" left="calm" right="max" min={0.2} max={1.8} step={0.05} value={settings.fxIntensity} onChange={(v: number) => update("fxIntensity", v)} format={(v: number) => `${Math.round(v * 100)}%`} />
              <SliderRow label="FX animation speed" left="slow" right="fast" min={0.4} max={2.0} step={0.1} value={settings.fxSpeed} onChange={(v: number) => update("fxSpeed", v)} format={(v: number) => `${v.toFixed(1)}x`} />

              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[var(--ink)]">Music beat reactive</span>
                <Switch on={settings.fxAudioReactive} onChange={(v: boolean) => update("fxAudioReactive", v)} label="Music beat reactive" />
              </div>

              {(settings.bgStyle === "media" || settings.bgStyle === "live") && (
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-[var(--ink)]">Show FX over video / wallpaper</span>
                  <Switch on={settings.fxOnMedia} onChange={(v: boolean) => update("fxOnMedia", v)} label="Show FX over video or wallpaper" />
                </div>
              )}

              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[var(--ink)]">Mouse click ripple</span>
                <Switch on={settings.clickFx} onChange={(v: boolean) => update("clickFx", v)} label="Mouse click ripple" />
              </div>

              <div className="mb-4 mt-4 h-px bg-white/8" />

              <SectionTitle>Clock display</SectionTitle>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[var(--ink)]">24-hour format</span>
                <Switch on={settings.clock24} onChange={(v: boolean) => update("clock24", v)} label="24 hour format" />
              </div>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[var(--ink)]">Show seconds</span>
                <Switch on={settings.showSeconds} onChange={(v: boolean) => update("showSeconds", v)} label="Show seconds" />
              </div>

              <SectionTitle>Weather location</SectionTitle>
              <div className="relative mb-2">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]">
                  <SearchIcon size={15} />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={pinned ? `Pinned: ${pinned.name}` : "Search a city to pin weather…"}
                  className="w-full rounded-[var(--radius-s)] border border-white/12 bg-white/6 py-2.5 pl-9 pr-3 text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)]/60"
                />
              </div>
              {searching && <p className="px-1 font-tmono text-[8.5px] uppercase tracking-[0.16em] text-[var(--dim)]/70">searching…</p>}
              {results.length > 0 && (
                <ul className="mb-3 overflow-hidden rounded-[var(--radius-s)] border border-white/10">
                  {results.map((r) => (
                    <li key={`${r.name}-${r.lat}`}>
                      <button
                        onClick={() => {
                          onPin(r);
                          setQ("");
                          setResults([]);
                        }}
                        className="w-full px-3 py-2 text-left text-[12.5px] text-[var(--ink)] transition-colors hover:bg-white/8"
                      >
                        {r.name}
                        <span className="block font-tmono text-[8.5px] uppercase tracking-[0.14em] text-[var(--dim)]">{r.region}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {pinned && (
                  <button onClick={() => onPin(null)} className="rounded-full border border-[var(--acc0)]/40 px-2.5 py-1 font-tmono text-[8.5px] uppercase tracking-[0.14em] text-[var(--acc0)]">
                    unpin · use my location
                  </button>
                )}
                <span className="font-tmono text-[8px] uppercase tracking-[0.14em] text-[var(--dim)]/70">
                  open-meteo · gps → ip fallback · live 90s
                </span>
              </div>

              <SectionTitle>Weather unit</SectionTitle>
              <div className="mb-4">
                <Segmented ariaLabel="Weather unit" options={[{ v: "c", label: "Celsius °C" }, { v: "f", label: "Fahrenheit °F" }]} value={settings.unit} onChange={(v: any) => update("unit", v)} />
              </div>

              <div className="mb-4 h-px bg-white/8" />

              <SectionTitle>Background style</SectionTitle>
              <div className="mb-3">
                <Segmented
                  ariaLabel="Background style"
                  options={BG_OPTS}
                  value={settings.bgStyle}
                  onChange={(v: any) => {
                    update("bgStyle", v);
                    if (v === "media" && settings.bgKind === "none" && !settings.bgUrl && !library.active) {
                      update("bgKind", "url");
                      update("bgUrl", PRESETS[0].url);
                    }
                  }}
                />
              </div>

              {settings.bgStyle === "media" && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-3">
                  {/* upload */}
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-s)] border border-dashed border-white/20 bg-white/4 py-3 font-tmono text-[9.5px] uppercase tracking-[0.16em] text-[var(--dim)] transition-colors hover:border-[var(--acc0)]/60 hover:text-[var(--acc0)] disabled:opacity-50"
                  >
                    <UploadIcon size={16} />
                    {busy ? "storing…" : `upload video / image · up to ${Math.round(maxUpload / 1048576)} MB`}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/*,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(f);
                      e.target.value = "";
                    }}
                  />

                  {/* history */}
                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-tmono text-[8.5px] uppercase tracking-[0.2em] text-[var(--dim)]">
                        history · {library.items.length}
                      </span>
                      {library.items.length > 0 && (
                        <span className="font-tmono text-[8px] uppercase tracking-[0.14em] text-[var(--dim)]/70">
                          {prettyBytes(totalSize)} cached
                        </span>
                      )}
                    </div>

                    {library.items.length === 0 ? (
                      <p className="rounded-[var(--radius-s)] border border-white/10 bg-white/3 px-3 py-3 text-[11.5px] leading-relaxed text-[var(--dim)]">
                        Nothing stored yet. Upload a clip (up to 25 MB) and it stays on this device — switch between your saved
                        wallpapers any time with one tap.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {library.items.map((it) => (
                          <MediaThumb
                            key={it.id}
                            item={it}
                            active={settings.bgKind === "library" && library.active === it.id}
                            onClick={() => onUseItem(it.id)}
                            onDelete={() => onDeleteItem(it.id)}
                          />
                        ))}
                      </div>
                    )}

                    {library.items.length > 0 && (
                      <button onClick={onClearMedia} className="mt-2 font-tmono text-[8.5px] uppercase tracking-[0.16em] text-[var(--dim)] transition-colors hover:text-[#ff9aa6]">
                        clear all {library.items.length} item{library.items.length === 1 ? "" : "s"}
                      </button>
                    )}
                  </div>

                  {/* remote url */}
                  <div className="mt-3 flex gap-2">
                    <input
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && urlDraft.trim()) {
                          update("bgUrl", urlDraft.trim());
                          update("bgKind", "url");
                          update("bgStyle", "media");
                          setUrlDraft("");
                        }
                      }}
                      placeholder="…or paste an image / video URL"
                      className="min-w-0 flex-1 rounded-[var(--radius-s)] border border-white/12 bg-white/6 px-3 py-2.5 text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)]/60"
                    />
                    <button
                      onClick={() => {
                        if (urlDraft.trim()) {
                          update("bgUrl", urlDraft.trim());
                          update("bgKind", "url");
                          update("bgStyle", "media");
                          setUrlDraft("");
                        }
                      }}
                      className="shrink-0 rounded-[var(--radius-s)] px-3 py-2 text-black"
                      style={{ background: "linear-gradient(135deg,var(--acc0),var(--acc1))" }}
                      aria-label="Apply background URL"
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M5 12.8 9.4 17 19 6.8" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {PRESETS.map((p) => {
                      const on = settings.bgKind === "url" && settings.bgUrl === p.url;
                      return (
                        <button
                          key={p.label}
                          onClick={() => {
                            update("bgUrl", p.url);
                            update("bgKind", "url");
                            update("bgStyle", "media");
                          }}
                          className="relative h-12 w-[4.5rem] overflow-hidden rounded-lg border transition-transform hover:scale-[1.04]"
                          style={{ borderColor: on ? "var(--acc0)" : "rgba(255,255,255,0.14)" }}
                        >
                          {p.url ? (
                            <img src={p.url} alt={p.label} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="grid h-full w-full place-items-center bg-white/6 text-[var(--dim)]">
                              <ImageIcon size={15} />
                            </span>
                          )}
                          <span className="absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 font-tmono text-[7px] uppercase tracking-[0.1em] text-white">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <SliderRow label="Media blur" left="sharp" right="soft" min={0} max={40} value={settings.bgBlur} onChange={(v: number) => update("bgBlur", v)} format={(v: number) => `${v}px`} />
                  <SliderRow label="Media dim" left="bright" right="dark" min={0} max={0.9} step={0.02} value={settings.bgDim} onChange={(v: number) => update("bgDim", v)} format={(v: number) => `${Math.round(v * 100)}%`} />
                </motion.div>
              )}

              {settings.bgStyle === "live" && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 space-y-3">
                  <div className="rounded-[var(--radius-s)] border border-[var(--acc0)]/30 bg-[var(--acc0)]/10 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--acc0)] animate-pulse" />
                      <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[var(--acc0)]">Live YouTube Sync</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--dim)]">
                      The active YouTube song plays full-bleed in the background, synchronized with the Room with zero extra audio or delay.
                    </p>
                  </div>
                  <SliderRow label="Video blur" left="sharp" right="soft" min={0} max={40} value={settings.bgBlur} onChange={(v: number) => update("bgBlur", v)} format={(v: number) => `${v}px`} />
                  <SliderRow label="Video dim" left="bright" right="dark" min={0} max={0.9} step={0.02} value={settings.bgDim} onChange={(v: number) => update("bgDim", v)} format={(v: number) => `${Math.round(v * 100)}%`} />
                </motion.div>
              )}

              <div className="mb-4 h-px bg-white/8" />

              <div className="grid grid-cols-2 gap-2">
                <button onClick={onExport} className="glass-soft flex items-center justify-center gap-1.5 rounded-[var(--radius-s)] py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.12em] text-[var(--dim)] transition-colors hover:text-[var(--acc0)]">
                  <ExportIcon size={14} /> Export
                </button>
                <button onClick={reset} className="flex items-center justify-center gap-1.5 rounded-[var(--radius-s)] border border-[#ff6b7a]/35 bg-[#ff6b7a]/10 py-2.5 font-tmono text-[9.5px] uppercase tracking-[0.12em] text-[#ff9aa6] transition-colors hover:bg-[#ff6b7a]/20">
                  <ResetIcon size={14} /> Reset
                </button>
              </div>
              <p className="mt-3 flex items-center gap-1.5 font-tmono text-[8px] uppercase tracking-[0.16em] text-[var(--dim)]/55">
                <DownloadIcon size={11} /> clips cached on device · settings saved locally
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
