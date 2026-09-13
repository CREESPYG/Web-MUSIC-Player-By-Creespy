import { useEffect } from "react";
import { hexToRgba } from "../lib/color";
import type { Settings } from "../hooks/useSettings";
import type { Theme } from "../themes";

/**
 * Custom background layer. Accepts either a remote URL or a resolved blob URL
 * from Cache/IndexedDB storage, and picks <video> vs <img> from the actual
 * mime type so uploaded video files actually render (previously every upload
 * was forced into an <img> tag, which showed nothing).
 */
export function MediaLayer({
  settings,
  theme,
  src,
  mime,
}: {
  settings: Settings;
  theme: Theme;
  src: string;
  mime: string;
}) {
  const isVideo = mime.startsWith("video/") || /\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(src);

  useEffect(() => {
    const v = document.getElementById("ripple-bg-video") as HTMLVideoElement | null;
    if (v) v.play().catch(() => {
      /* needs a gesture — first frame still shows */
    });
  }, [src]);

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
          className="h-full w-full object-cover"
          style={{ filter: `blur(${settings.bgBlur}px) saturate(1.1)`, transform: "scale(1.12)" }}
        />
      ) : (
        <img
          key={src}
          src={src}
          alt=""
          className="h-full w-full object-cover"
          style={{ filter: `blur(${settings.bgBlur}px) saturate(1.1)`, transform: "scale(1.12)" }}
        />
      )}
      <div className="absolute inset-0" style={{ background: hexToRgba(theme.bg0, settings.bgDim) }} />
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, transparent 20%, ${hexToRgba(theme.bg0, 0.75)} 100%)` }}
      />
    </div>
  );
}
