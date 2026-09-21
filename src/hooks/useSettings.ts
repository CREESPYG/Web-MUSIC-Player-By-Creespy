import { useCallback, useEffect, useMemo, useState } from "react";
import type { Theme } from "../themes";

export type BgStyle = "solid" | "dynamic" | "wave" | "media" | "live";
export type BgKind = "url" | "library" | "none";
export type FxType = "full" | "aurora" | "wave" | "orbs" | "particles" | "minimal";

export interface Settings {
  themeId: string;
  clock24: boolean;
  showSeconds: boolean;
  unit: "c" | "f";
  bgStyle: BgStyle;
  bgKind: BgKind;
  bgUrl: string;
  bgBlur: number;
  bgDim: number;
  borderWidth: number;
  tileOpacity: number;
  tileSize: number;
  customAccent: string | null;
  fxType: FxType;
  fxIntensity: number;
  fxSpeed: number;
  fxAudioReactive: boolean;
  fxOnMedia: boolean;
  clickFx: boolean;
}

export const DEFAULTS: Settings = {
  themeId: "abyss",
  clock24: false,
  showSeconds: true,
  unit: "c",
  bgStyle: "dynamic",
  bgKind: "none",
  bgUrl: "",
  bgBlur: 14,
  bgDim: 0.5,
  borderWidth: 1,
  tileOpacity: 1,
  tileSize: 26,
  customAccent: null,
  fxType: "full",
  fxIntensity: 1,
  fxSpeed: 1,
  fxAudioReactive: true,
  fxOnMedia: true,
  clickFx: true,
};

const KEY = "ripple.settings.v1";
const MAX_UPLOAD = 25 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "25 MB";

export function useSettings(theme: Theme, applyTheme: (id: string) => void) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      /* noop */
    }
    return DEFAULTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* noop */
    }
  }, [settings]);

  const update = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
  }, []);

  useEffect(() => {
    if (settings.themeId !== theme.id) applyTheme(settings.themeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.themeId]);

  const glassVars = useMemo(
    () => ({
      "--glass-bg": `linear-gradient(155deg, rgba(255,255,255,${(0.085 * settings.tileOpacity).toFixed(3)}), rgba(255,255,255,${(0.028 * settings.tileOpacity).toFixed(3)}))`,
      "--glass-border": `rgba(255,255,255,${(0.06 + 0.09 * settings.tileOpacity).toFixed(3)})`,
      "--bw": `${settings.borderWidth}px`,
      "--radius": `${settings.tileSize}px`,
      "--radius-s": `${Math.max(8, Math.round(settings.tileSize * 0.66))}px`,
      "--blur": `${Math.round(10 + 6 * settings.tileOpacity)}px`,
      "--blur-s": `${Math.round(6 + 4 * settings.tileOpacity)}px`,
    }) as React.CSSProperties,
    [settings.tileOpacity, settings.borderWidth, settings.tileSize]
  );

  const reset = useCallback(() => setSettings({ ...DEFAULTS }), []);

  return { settings, update, glassVars, reset, maxUpload: MAX_UPLOAD };
}
