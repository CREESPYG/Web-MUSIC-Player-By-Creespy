import { useEffect, useState } from "react";
import { hexToRgba } from "../lib/color";
import type { Settings } from "../hooks/useSettings";
import type { Theme } from "../themes";
import type { Track } from "../lib/trackModel";

/**
 * Custom background layer. Supports:
 * 1. "live": Cinematic YouTube Live Video Background using the active track's video.
 *    Single-source playback with 0 duplicate audio, 0 echo, pointer-events: none,
 *    and dark glassmorphism contrast overlays. Respects prefers-reduced-motion.
 * 2. "media": Custom user-uploaded or preset video / image wallpapers.
 */
export function MediaLayer({
  settings,
  theme,
  src,
  mime,
  currentTrack,
}: {
  settings: Settings;
  theme: Theme;
  src: string;
  mime: string;
  currentTrack?: Track | null;
}) {
  const isVideo = mime.startsWith("video/") || /\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(src);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  // Sync YouTube player container styling with Live Video Background setting
  useEffect(() => {
    const applyLiveBg = () => {
      const container = document.getElementById("youtube-player-container");
      if (!container) return false;

      if (settings.bgStyle === "live" && !reducedMotion) {
        container.className = "yt-live-bg";
        container.style.filter = `blur(${settings.bgBlur}px) saturate(1.15)`;
      } else {
        container.className = "yt-hidden";
        container.style.filter = "";
      }
      return true;
    };

    // If container is already mounted, apply immediately
    const applied = applyLiveBg();
    let timer: ReturnType<typeof setInterval> | null = null;
    if (!applied) {
      // Poll every 80ms until container is mounted in DOM
      timer = setInterval(() => {
        if (applyLiveBg()) {
          if (timer) clearInterval(timer);
          timer = null;
        }
      }, 80);
    }

    return () => {
      if (timer) clearInterval(timer);
      const c = document.getElementById("youtube-player-container");
      if (c && settings.bgStyle !== "live") {
        c.className = "yt-hidden";
        c.style.filter = "";
      }
    };
  }, [settings.bgStyle, settings.bgBlur, reducedMotion, currentTrack]);

  // Video element autoplay loop handler for custom uploaded wallpapers
  useEffect(() => {
    const v = document.getElementById("ripple-bg-video") as HTMLVideoElement | null;
    if (v) {
      v.play().catch(() => {
        /* needs a gesture — first frame still shows */
      });
    }
    return () => {
      if (v) {
        try {
          v.pause();
          v.removeAttribute("src");
          v.load();
        } catch {
          /* noop */
        }
      }
    };
  }, [src]);

  // Handle "live" YouTube Video Background
  if (settings.bgStyle === "live") {
    // If user prefers reduced motion or browser limits continuous video, render static artwork fallback
    if (reducedMotion) {
      const artUrl = currentTrack?.thumb || currentTrack?.artwork || "";
      return (
        <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
          {artUrl && (
            <img
              key={artUrl}
              src={artUrl}
              alt=""
              className="h-full w-full object-cover transition-all duration-300"
              style={{ filter: `blur(${settings.bgBlur}px) saturate(1.15)`, transform: "scale(1.08)" }}
            />
          )}
          <div
            className="absolute inset-0 transition-all duration-200"
            style={{ background: hexToRgba(theme.bg0, settings.bgDim) }}
          />
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(120% 90% at 50% 15%, transparent 35%, ${hexToRgba(theme.bg0, 0.65)} 100%)` }}
          />
        </div>
      );
    }

    // Default live video overlay: placed at z-[2] directly over the full-screen YouTube iframe at z-[1]
    return (
      <div className="pointer-events-none fixed inset-0 z-[2] overflow-hidden" aria-hidden>
        {/* Dynamic dim tint layer controlled by user's Dim slider */}
        <div
          className="absolute inset-0 transition-all duration-200"
          style={{ background: hexToRgba(theme.bg0, settings.bgDim) }}
        />
        {/* Soft atmospheric gradient to maintain glassmorphism contrast and text readability */}
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(120% 90% at 50% 15%, transparent 35%, ${hexToRgba(theme.bg0, 0.65)} 100%)` }}
        />
      </div>
    );
  }

  // Handle custom "media" wallpaper style
  if (settings.bgStyle !== "media" || !src) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden>
      {isVideo ? (
        <video
          id="ripple-bg-video"
          key={src}
          src={src}
          muted
          loop
          autoPlay
          playsInline
          className="h-full w-full object-cover transition-all duration-300"
          style={{ filter: `blur(${settings.bgBlur}px) saturate(1.15)`, transform: "scale(1.08)" }}
        />
      ) : (
        <img
          key={src}
          src={src}
          alt=""
          className="h-full w-full object-cover transition-all duration-300"
          style={{ filter: `blur(${settings.bgBlur}px) saturate(1.15)`, transform: "scale(1.08)" }}
        />
      )}
      {/* Dynamic tint layer strictly bound to user's Media Dim slider */}
      <div
        className="absolute inset-0 transition-all duration-200"
        style={{ background: hexToRgba(theme.bg0, settings.bgDim) }}
      />
      {/* Soft atmospheric gradient to maintain glassmorphism contrast without crushing wallpaper details */}
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(120% 90% at 50% 15%, transparent 35%, ${hexToRgba(theme.bg0, 0.55)} 100%)` }}
      />
    </div>
  );
}
