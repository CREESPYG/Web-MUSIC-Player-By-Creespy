import { useEffect, useRef } from "react";
import type { Track } from "../lib/trackModel";
import { resolveVideoStream, invalidateVideoStream } from "../lib/streamResolver";

/**
 * "Live" background style — plays the current track's music video in a fixed
 * fullscreen <video> behind the app (musike-style video element). Always
 * muted: the audio itself comes from the HTML5 audio engine, the video is
 * purely a wallpaper.
 */
export function useLiveBgVideo(bgStyle: string, track: Track | undefined, playing: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tokenRef = useRef(0);

  const active = bgStyle === "live";
  const videoId = active ? track?.videoId ?? "" : "";

  // Create / remove the container as the style toggles.
  useEffect(() => {
    if (!active) {
      const el = document.getElementById("live-bg-video");
      el?.remove();
      videoRef.current = null;
      return;
    }
    let container = document.getElementById("live-bg-video");
    if (!container) {
      container = document.createElement("div");
      container.id = "live-bg-video";
      container.className = "yt-live-bg";
      container.setAttribute("aria-hidden", "true");
      const video = document.createElement("video");
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.preload = "auto";
      container.appendChild(video);
      videoRef.current = video;
      document.body.appendChild(container);
    }
    return () => {
      const el = document.getElementById("live-bg-video");
      el?.remove();
      videoRef.current = null;
    };
  }, [active]);

  // Resolve + load the video stream whenever the track changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;
    const token = ++tokenRef.current;
    if (!videoId) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      return;
    }
    resolveVideoStream(videoId)
      .then((info) => {
        if (token !== tokenRef.current) return; // a newer track won
        video.src = info.url;
        video.load();
        if (playing) video.play().catch(() => { /* autoplay guard */ });
      })
      .catch(() => {
        if (token !== tokenRef.current) return;
        invalidateVideoStream(videoId);
        video.pause();
        video.removeAttribute("src");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, videoId]);

  // Mirror the player's play/pause state.
  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video || !video.getAttribute("src")) return;
    if (playing) video.play().catch(() => { /* autoplay guard */ });
    else video.pause();
  }, [active, playing]);
}
