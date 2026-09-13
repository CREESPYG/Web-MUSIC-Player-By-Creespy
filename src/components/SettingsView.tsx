import React, { useState } from "react";
import { THEMES } from "../themes";
import { persistence, type AppPreferences } from "../lib/persistence";
import {
  SettingsIcon,
  PaletteIcon,
  SparklesIcon,
  EyeIcon,
  RefreshCwIcon,
  DownloadIcon,
  UploadIcon,
  CheckIcon,
  SunIcon,
} from "./UiIcons";

interface SettingsViewProps {
  currentThemeId: string;
  onApplyTheme: (id: string) => void;
  onToast: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentThemeId,
  onApplyTheme,
  onToast,
}) => {
  const [prefs, setPrefs] = useState<AppPreferences>(() => persistence.getPreferences());
  const [resetConfirm, setResetConfirm] = useState(false);

  const updatePreference = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    persistence.setPreferences({ [key]: value });
  };

  const handleExport = () => {
    const data = persistence.getStore();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ripple-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast("Preferences & playlists backup exported");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed && typeof parsed === "object") {
          localStorage.setItem("ripple.central_store.v3", JSON.stringify(parsed));
          window.location.reload();
        }
      } catch {
        onToast("Invalid backup file format");
      }
    };
    reader.readAsText(file);
  };

  const handleFactoryReset = () => {
    localStorage.removeItem("ripple.central_store.v3");
    localStorage.removeItem("ripple-theme");
    localStorage.removeItem("ripple-custom-tracks");
    window.location.reload();
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-4 py-6 md:px-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--acc0)]/20 text-[var(--acc0)]">
            <SettingsIcon size={18} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Customization & Settings</h1>
        </div>
        <p className="mt-1 text-xs text-[var(--dim)]">
          Fine-tune themes, motion intensity, audio visuals, and local persistence
        </p>
      </div>

      {/* Theme Palette Selection */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <PaletteIcon size={16} className="text-[var(--acc0)]" />
          Color Theme & Atmospheric Palette
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {THEMES.map((theme) => {
            const isSelected = currentThemeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => {
                  onApplyTheme(theme.id);
                  updatePreference("themeId", theme.id);
                  onToast(`Theme set to ${theme.name}`);
                }}
                className={`relative flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-[var(--acc0)] bg-white/10 shadow-md ring-1 ring-[var(--acc0)]"
                    : "border-white/5 bg-black/20 hover:border-white/20 hover:bg-white/5"
                }`}
              >
                <div className="flex h-6 w-full items-center gap-1.5 rounded-md p-1 mb-2.5 bg-black/40 border border-white/5">
                  <div
                    className="h-full w-4 rounded-sm"
                    style={{ background: theme.acc0 }}
                  />
                  <div
                    className="h-full w-4 rounded-sm"
                    style={{ background: theme.acc1 }}
                  />
                  <div
                    className="h-full flex-1 rounded-sm"
                    style={{ background: theme.bg0 }}
                  />
                </div>
                <span className="text-xs font-medium text-white">{theme.name}</span>
                <span className="text-[10px] text-[var(--dim)] mt-0.5">{theme.tagline}</span>

                {isSelected && (
                  <div className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--acc0)] text-black">
                    <CheckIcon size={10} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Audio Visualizer & Background Style */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <SparklesIcon size={16} className="text-[var(--acc0)]" />
          Display & Backdrop Mode
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-white block mb-2">Backdrop Canvas Style</label>
            <div className="grid grid-cols-3 gap-2">
              {(["dynamic", "solid", "wave"] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => {
                    updatePreference("bgStyle", style);
                    onToast(`Backdrop set to ${style}`);
                  }}
                  className={`rounded-lg border p-2 text-xs font-medium capitalize transition-all ${
                    prefs.bgStyle === style
                      ? "border-[var(--acc0)] bg-[var(--acc0)]/20 text-white"
                      : "border-white/10 bg-black/20 text-[var(--dim)] hover:text-white"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-white block mb-2">Disc Spectrum Visualizer</label>
            <div className="grid grid-cols-4 gap-2">
              {(["circle", "wave", "bars", "off"] as const).map((viz) => (
                <button
                  key={viz}
                  onClick={() => {
                    updatePreference("visualizerMode", viz);
                    onToast(`Visualizer set to ${viz}`);
                  }}
                  className={`rounded-lg border p-2 text-xs font-medium capitalize transition-all ${
                    prefs.visualizerMode === viz
                      ? "border-[var(--acc0)] bg-[var(--acc0)]/20 text-white"
                      : "border-white/10 bg-black/20 text-[var(--dim)] hover:text-white"
                  }`}
                >
                  {viz}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Clock & Telemetry Settings */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <SunIcon size={16} className="text-[var(--acc0)]" />
          Time & Telemetry Preferences
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Clock format */}
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3">
            <div>
              <div className="text-xs font-medium text-white">24-Hour Time</div>
              <div className="text-[10px] text-[var(--dim)]">Military clock format</div>
            </div>
            <button
              onClick={() => updatePreference("clock24", !prefs.clock24)}
              className={`h-5 w-9 rounded-full transition-colors relative ${
                prefs.clock24 ? "bg-[var(--acc0)]" : "bg-white/20"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  prefs.clock24 ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Show seconds */}
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3">
            <div>
              <div className="text-xs font-medium text-white">Show Seconds</div>
              <div className="text-[10px] text-[var(--dim)]">DigitFlipper seconds</div>
            </div>
            <button
              onClick={() => updatePreference("showSeconds", !prefs.showSeconds)}
              className={`h-5 w-9 rounded-full transition-colors relative ${
                prefs.showSeconds ? "bg-[var(--acc0)]" : "bg-white/20"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  prefs.showSeconds ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Temperature unit */}
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3">
            <div>
              <div className="text-xs font-medium text-white">Weather Units</div>
              <div className="text-[10px] text-[var(--dim)]">Celsius vs Fahrenheit</div>
            </div>
            <div className="flex rounded-md bg-white/10 p-0.5">
              <button
                onClick={() => updatePreference("weatherUnit", "c")}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                  prefs.weatherUnit === "c" ? "bg-[var(--acc0)] text-black" : "text-[var(--dim)]"
                }`}
              >
                °C
              </button>
              <button
                onClick={() => updatePreference("weatherUnit", "f")}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                  prefs.weatherUnit === "f" ? "bg-[var(--acc0)] text-black" : "text-[var(--dim)]"
                }`}
              >
                °F
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Accessibility & Behavior */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <EyeIcon size={16} className="text-[var(--acc0)]" />
          Accessibility & Navigation
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Reduced motion */}
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3">
            <div>
              <div className="text-xs font-medium text-white">Reduced Motion</div>
              <div className="text-[10px] text-[var(--dim)]">Disables intensive transitions</div>
            </div>
            <button
              onClick={() => {
                updatePreference("reducedMotion", !prefs.reducedMotion);
                onToast(prefs.reducedMotion ? "Motion enabled" : "Reduced motion active");
              }}
              className={`h-5 w-9 rounded-full transition-colors relative ${
                prefs.reducedMotion ? "bg-[var(--acc0)]" : "bg-white/20"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  prefs.reducedMotion ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Skip Landing */}
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 p-3">
            <div>
              <div className="text-xs font-medium text-white">Auto-Open Player</div>
              <div className="text-[10px] text-[var(--dim)]">Skip landing on return visits</div>
            </div>
            <button
              onClick={() => {
                updatePreference("skipLanding", !prefs.skipLanding);
                onToast(prefs.skipLanding ? "Landing page shown on launch" : "Player opens directly");
              }}
              className={`h-5 w-9 rounded-full transition-colors relative ${
                prefs.skipLanding ? "bg-[var(--acc0)]" : "bg-white/20"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  prefs.skipLanding ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Data Backup & Factory Reset */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
          <DownloadIcon size={16} className="text-[var(--acc0)]" />
          Data Backup & Reset
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors"
          >
            <DownloadIcon size={14} />
            Export Backup JSON
          </button>

          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors">
            <UploadIcon size={14} />
            Import Backup JSON
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>

          {resetConfirm ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleFactoryReset}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Confirm Full Reset
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[var(--dim)] hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setResetConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors ml-auto"
            >
              <RefreshCwIcon size={14} />
              Factory Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
