import { useRef, useState } from "react";
import type { Settings, BgStyle, FxType } from "../../../hooks/useSettings";
import { THEMES, type Theme } from "../../../themes";
import { AccentColorPicker } from "../../AccentColorPicker";
import { Switch, UploadIcon, TrashIcon, CloseIcon, CheckIcon, PlayIcon, ImageIcon } from "../../UiIcons";
import type { BgLibrary } from "../../../lib/bgStore";

interface Props {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, val: Settings[K]) => void;
  reset: () => void;
  theme: Theme;
  onTheme: (id: string) => void;
  onFile: (file: File) => void;
  uploadBusy: boolean;
  maxUpload: number;
  onToast: (msg: string) => void;
  library: BgLibrary;
  onUseItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onClearMedia: () => void;
}

const BG_STYLES: { id: BgStyle; label: string; desc: string }[] = [
  { id: "dynamic", label: "Dynamic", desc: "Cosmic orbs & mesh" },
  { id: "wave", label: "Wave", desc: "Audio reactive sine" },
  { id: "solid", label: "Solid", desc: "Minimalist dark" },
  { id: "media", label: "Media", desc: "Wallpaper / video" },
];

const FX_MODES: { id: FxType; label: string; desc: string }[] = [
  { id: "full", label: "Full", desc: "Orbs + Waves + Stars" },
  { id: "aurora", label: "Aurora", desc: "Northern Lights" },
  { id: "wave", label: "Wave", desc: "Sine Ribbons" },
  { id: "orbs", label: "Orbs", desc: "Cosmic Plasma" },
  { id: "particles", label: "Stardust", desc: "Drifting Stars" },
  { id: "minimal", label: "Minimal", desc: "Clean Ambient" },
];

const PRESETS = [
  { label: "Studio", url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=60" },
  { label: "Dusk", url: "https://images.unsplash.com/photo-1499346030926-9a72daac6c63?auto=format&fit=crop&w=1200&q=60" },
  { label: "Rain", url: "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=1200&q=60" },
  { label: "Neon", url: "https://images.unsplash.com/photo-1518972559570-7cc1309f3229?auto=format&fit=crop&w=1200&q=60" },
  { label: "Lo-Fi", url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=60" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-tmono text-[9px] uppercase tracking-[0.2em] text-[var(--dim)]">
      {children}
    </p>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--ink)]">{label}</span>
        <span className="font-tmono text-[10px] text-[var(--acc0)]">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vol w-full"
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

function SwitchRow({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0 flex-1 pr-3">
        <span className="text-xs font-medium text-[var(--ink)]">{label}</span>
        {desc && <p className="text-[10px] text-[var(--dim)]">{desc}</p>}
      </div>
      <Switch on={on} onChange={onChange} />
    </div>
  );
}

export function MobileCustomizeScreen({
  settings,
  update,
  reset,
  theme,
  onTheme,
  onFile,
  uploadBusy,
  maxUpload,
  onToast,
  library,
  onUseItem,
  onDeleteItem,
  onClearMedia,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxUpload) {
      onToast(`File exceeds ${Math.round(maxUpload / 1048576)} MB limit`);
      return;
    }
    onFile(file);
    e.target.value = "";
  };

  const applyUrl = (url: string) => {
    if (!url.trim()) return;
    update("bgUrl", url.trim());
    update("bgKind", "url");
    update("bgStyle", "media");
    setUrlDraft("");
  };

  const isCustomAccentActive =
    Boolean(settings.customAccent) &&
    settings.customAccent?.toLowerCase() !== theme.acc0.toLowerCase();

  return (
    <div className="scroll-slim flex h-full flex-col overflow-y-auto px-4 py-3 pb-12">
      {/* ─── 1. Accent Theme & Color ─── */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>Accent Theme & Color</SectionTitle>
          {isCustomAccentActive && (
            <button
              type="button"
              onClick={() => { update("customAccent", null); onToast("Reset to theme accent"); }}
              className="font-tmono text-[9px] uppercase tracking-wider text-[var(--dim)] underline decoration-white/30 hover:text-white"
            >
              Reset
            </button>
          )}
        </div>

        {/* Preset theme grid */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {THEMES.map((t) => {
            const on = !isCustomAccentActive && settings.themeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onTheme(t.id);
                  update("themeId", t.id);
                  update("customAccent", null);
                  onToast(`Applied ${t.name} theme`);
                }}
                className="relative overflow-hidden rounded-xl border p-2.5 text-left transition-all active:scale-95"
                style={{
                  borderColor: on ? t.acc0 : "rgba(255,255,255,0.1)",
                  background: on ? `linear-gradient(135deg, ${t.acc0}22, ${t.acc1}12)` : "rgba(255,255,255,0.04)",
                }}
              >
                <span className="flex items-center gap-1.5">
                  {[t.acc0, t.acc1, t.acc2].map((c) => (
                    <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
                  ))}
                </span>
                <span className="mt-1.5 block font-display text-[11px] font-bold text-[var(--ink)]">{t.name}</span>
                <span className="block font-tmono text-[8px] uppercase tracking-[0.12em] text-[var(--dim)]">{t.tagline}</span>
                {on && (
                  <span
                    className="absolute right-2 top-2 h-2 w-2 rounded-full"
                    style={{ background: t.acc0, boxShadow: `0 0 8px ${t.acc0}` }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Accent Color Picker (correct API: color + onChange) */}
        <AccentColorPicker
          color={settings.customAccent || theme.acc0}
          onChange={(hex) => update("customAccent", hex)}
        />
      </div>

      {/* Divider */}
      <div className="mb-4 h-px bg-white/8" />

      {/* ─── 2. Glass Tile Appearance ─── */}
      <div className="mb-5">
        <SectionTitle>Glass Tiles</SectionTitle>
        <SliderRow label="Border width" value={settings.borderWidth} min={0} max={4} step={0.5} fmt={(v) => `${v}px`} onChange={(v) => update("borderWidth", v)} />
        <SliderRow label="Tile opacity" value={settings.tileOpacity} min={0.2} max={2} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update("tileOpacity", v)} />
        <SliderRow label="Roundness" value={settings.tileSize} min={6} max={40} fmt={(v) => `${v}px`} onChange={(v) => update("tileSize", v)} />
      </div>

      {/* Divider */}
      <div className="mb-4 h-px bg-white/8" />

      {/* ─── 3. Visual FX ─── */}
      <div className="mb-5">
        <SectionTitle>Visual FX Mode</SectionTitle>

        {/* FX Type Grid */}
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {FX_MODES.map((fx) => {
            const on = settings.fxType === fx.id;
            return (
              <button
                key={fx.id}
                type="button"
                onClick={() => update("fxType", fx.id)}
                className="flex flex-col items-start rounded-lg border p-2 text-left transition-all active:scale-95"
                style={{
                  borderColor: on ? "var(--acc0)" : "rgba(255,255,255,0.1)",
                  background: on ? "color-mix(in srgb, var(--acc0) 15%, transparent)" : "rgba(255,255,255,0.04)",
                }}
              >
                <span className={`font-display text-[10px] font-bold ${on ? "text-[var(--acc0)]" : "text-[var(--ink)]"}`}>
                  {fx.label}
                </span>
                <span className="font-tmono text-[7.5px] leading-tight text-[var(--dim)] opacity-80">{fx.desc}</span>
              </button>
            );
          })}
        </div>

        <SliderRow label="FX Intensity" value={settings.fxIntensity} min={0.2} max={1.8} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update("fxIntensity", v)} />
        <SliderRow label="FX Speed" value={settings.fxSpeed} min={0.4} max={2.0} step={0.1} fmt={(v) => `${v.toFixed(1)}x`} onChange={(v) => update("fxSpeed", v)} />

        <div className="divide-y divide-white/6">
          <SwitchRow label="Audio Reactive" desc="Pulses in sync with music beats" on={settings.fxAudioReactive} onChange={(v) => update("fxAudioReactive", v)} />
          {settings.bgStyle === "media" && (
            <SwitchRow label="FX Over Wallpaper" desc="Show effects above your wallpaper" on={settings.fxOnMedia} onChange={(v) => update("fxOnMedia", v)} />
          )}
          <SwitchRow label="Tap Ripple" desc="Water-drop effect on touch/click" on={settings.clickFx} onChange={(v) => update("clickFx", v)} />
        </div>
      </div>

      {/* Divider */}
      <div className="mb-4 h-px bg-white/8" />

      {/* ─── 4. Background Style ─── */}
      <div className="mb-5">
        <SectionTitle>Background Style</SectionTitle>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {BG_STYLES.map((st) => {
            const on = settings.bgStyle === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  update("bgStyle", st.id);
                  if (st.id === "media" && settings.bgKind === "none" && !settings.bgUrl && !library.active) {
                    update("bgKind", "url");
                    update("bgUrl", PRESETS[0].url);
                  }
                }}
                className="flex flex-col items-start rounded-xl border p-3 text-left transition-all active:scale-95"
                style={{
                  borderColor: on ? "var(--acc0)" : "rgba(255,255,255,0.1)",
                  background: on ? "color-mix(in srgb, var(--acc0) 12%, transparent)" : "rgba(255,255,255,0.04)",
                }}
              >
                <span className={`font-display text-xs font-bold ${on ? "text-[var(--acc0)]" : "text-[var(--ink)]"}`}>{st.label}</span>
                <span className="text-[10px] text-[var(--dim)]">{st.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Media Mode: Upload + URL + Presets + Sliders */}
        {settings.bgStyle === "media" && (
          <div className="flex flex-col gap-3 rounded-xl border border-white/6 bg-white/[0.01] p-3">
            {/* Upload button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,video/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/4 py-2.5 font-tmono text-[9.5px] uppercase tracking-wider text-[var(--dim)] transition-colors hover:border-[var(--acc0)]/50 hover:text-[var(--acc0)] disabled:opacity-40"
            >
              <UploadIcon size={14} />
              {uploadBusy ? "Uploading…" : `Upload image / video · up to ${Math.round(maxUpload / 1048576)} MB`}
            </button>

            {/* Library */}
            {library.items.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-tmono text-[8.5px] uppercase tracking-wider text-[var(--dim)]">
                    Saved · {library.items.length}
                  </span>
                  <button
                    type="button"
                    onClick={onClearMedia}
                    className="flex items-center gap-1 font-tmono text-[8px] uppercase tracking-wider text-[var(--dim)] hover:text-[#ff9aa6]"
                  >
                    <TrashIcon size={10} /> Clear
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {library.items.map((it: any) => {
                    const isActive = settings.bgKind === "library" && library.active === it.id;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => onUseItem(it.id)}
                        className="relative aspect-video overflow-hidden rounded-lg border transition-transform hover:scale-[1.03]"
                        style={{ borderColor: isActive ? "var(--acc0)" : "rgba(255,255,255,0.14)" }}
                      >
                        {isActive && (
                          <span
                            className="absolute right-1 top-1 h-2 w-2 rounded-full"
                            style={{ background: "var(--acc0)", boxShadow: "0 0 6px var(--acc0)" }}
                          />
                        )}
                        <span className="grid h-full w-full place-items-center bg-white/8 text-[var(--dim)]">
                          {it.kind === "video" ? <PlayIcon size={14} /> : <ImageIcon size={14} />}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDeleteItem(it.id); }}
                          className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded bg-black/65 text-white/70 opacity-0 transition-opacity hover:opacity-100"
                        >
                          <CloseIcon size={10} />
                        </button>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preset thumbnails */}
            <div>
              <p className="mb-2 font-tmono text-[8.5px] uppercase tracking-wider text-[var(--dim)]">Presets</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {PRESETS.map((p) => {
                  const on = settings.bgKind === "url" && settings.bgUrl === p.url;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { update("bgUrl", p.url); update("bgKind", "url"); update("bgStyle", "media"); }}
                      className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border transition-transform hover:scale-[1.05]"
                      style={{ borderColor: on ? "var(--acc0)" : "rgba(255,255,255,0.14)" }}
                    >
                      <img src={p.url} alt={p.label} className="h-full w-full object-cover" loading="lazy" />
                      <span className="absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 font-tmono text-[7px] text-white">
                        {p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Remote URL */}
            <div className="flex gap-2">
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyUrl(urlDraft); }}
                placeholder="…or paste image / video URL"
                className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/6 px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--dim)]/60 focus:border-[var(--acc0)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => applyUrl(urlDraft)}
                disabled={!urlDraft.trim()}
                className="shrink-0 grid h-9 w-9 place-items-center rounded-xl text-black disabled:opacity-40"
                style={{ background: "var(--acc0)" }}
              >
                <CheckIcon size={14} />
              </button>
            </div>

            {/* Blur & Dim sliders */}
            <SliderRow label="Blur" value={settings.bgBlur} min={0} max={40} fmt={(v) => `${v}px`} onChange={(v) => update("bgBlur", v)} />
            <SliderRow label="Dim" value={settings.bgDim} min={0} max={0.9} step={0.02} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update("bgDim", v)} />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mb-4 h-px bg-white/8" />

      {/* ─── 5. Clock Settings ─── */}
      <div className="mb-5">
        <SectionTitle>Clock Display</SectionTitle>
        <div className="divide-y divide-white/6">
          <SwitchRow label="24-hour format" on={settings.clock24} onChange={(v) => update("clock24", v)} />
          <SwitchRow label="Show seconds" on={settings.showSeconds} onChange={(v) => update("showSeconds", v)} />
        </div>
      </div>

      {/* Divider */}
      <div className="mb-4 h-px bg-white/8" />

      {/* ─── 6. Reset ─── */}
      <button
        type="button"
        onClick={() => { reset(); onToast("Customizations reset to default"); }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff6b7a]/30 bg-[#ff6b7a]/10 py-3 font-display text-xs font-bold text-[#ffb3ba] transition-colors hover:bg-[#ff6b7a]/20 active:scale-[0.98]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        Reset All Settings
      </button>
    </div>
  );
}
