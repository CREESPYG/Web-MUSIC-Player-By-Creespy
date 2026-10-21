/**
 * Innertube stream resolution — shared by the Netlify function (production)
 * and the Vite dev middleware (local `npm run dev`). Runs server-side in both
 * cases, so the browser never talks to YouTube directly (no CORS issues).
 *
 * Mirrors musike's server-side yt-dlp/Innertube resolution, but uses the
 * public ANDROID Innertube player endpoint with no external binaries.
 */

const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";

export interface InnertubeAudioResult {
  ok: true;
  id: string;
  url: string;
  itag: number;
  mime: string;
  expireAt: number;
  durationSeconds: number | null;
  title: string;
  author: string;
  thumbnail: string;
}

export interface InnertubeVideoResult {
  ok: true;
  id: string;
  url: string;
  mime: string;
  expireAt: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface InnertubeError {
  ok: false;
  error: string;
  status: number;
}

export type InnertubeResult = InnertubeAudioResult | InnertubeVideoResult | InnertubeError;

function expireFromUrl(u: string): number {
  const m = u.match(/[?&]expire=(\d+)/);
  return m ? Number(m[1]) * 1000 : Date.now() + 4 * 3_600_000;
}

export async function resolveInnertube(videoId: string, kind: "audio" | "video"): Promise<InnertubeResult> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return { ok: false, error: "invalid video id", status: 400 };
  }

  const body = JSON.stringify({
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "20.10.38",
        androidSdkVersion: 30,
        hl: "en",
        gl: "US",
      },
    },
  });

  let j: any;
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": ANDROID_UA,
        // Public Android-client API key embedded in every YouTube Android APK;
        // YouTube enforces it from datacenter/serverless IPs (e.g. Vercel),
        // where omitting it yields playability LOGIN_REQUIRED.
        authorization: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
        "x-youtube-client-name": "3",
        "x-youtube-client-version": "20.10.38",
      },
      body,
    });
    if (!r.ok) return { ok: false, error: `upstream ${r.status}`, status: 502 };
    j = await r.json();
  } catch {
    return { ok: false, error: "upstream unreachable", status: 502 };
  }

  const status: string | undefined = j?.playabilityStatus?.status;
  if (status && status !== "OK") {
    return { ok: false, error: `playability ${status}`, status: 404 };
  }

  const details = j?.videoDetails ?? {};
  const thumbs: any[] = details.thumbnail?.thumbnails ?? [];
  const thumb: string = thumbs.length ? thumbs[thumbs.length - 1].url : "";
  const durationSeconds = details.lengthSeconds ? Number(details.lengthSeconds) || null : null;

  if (kind === "audio") {
    const fmts: any[] = j?.streamingData?.adaptiveFormats ?? [];
    const audio = fmts.filter((f) => typeof f.mimeType === "string" && f.mimeType.startsWith("audio/") && f.url);
    if (!audio.length) return { ok: false, error: "no audio streams", status: 404 };
    // itag 140 (AAC m4a) plays everywhere including iOS Safari; else best m4a; else best bitrate.
    const byItag = audio.find((f) => f.itag === 140);
    const m4a = audio
      .filter((f) => String(f.mimeType).includes("mp4"))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const pick = byItag || m4a[0] || [...audio].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    return {
      ok: true,
      id: videoId,
      url: pick.url,
      itag: pick.itag,
      mime: pick.mimeType,
      expireAt: expireFromUrl(pick.url),
      durationSeconds,
      title: details.title ?? "",
      author: details.author ?? "",
      thumbnail: thumb,
    };
  }

  // video: prefer muxed mp4 (itag 18 has audio+video), else best adaptive mp4 ≤720p.
  const muxed: any[] = (j?.streamingData?.formats ?? []).filter((f: any) => f.url && String(f.mimeType).includes("mp4"));
  const adaptive: any[] = (j?.streamingData?.adaptiveFormats ?? []).filter(
    (f: any) => f.url && String(f.mimeType).startsWith("video/") && String(f.mimeType).includes("mp4")
  );
  const pick =
    muxed.find((f) => f.itag === 18) ||
    [...muxed].sort((a, b) => (b.height || 0) - (a.height || 0))[0] ||
    adaptive
      .filter((f) => (f.height || 0) <= 720)
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0] ||
    [...adaptive].sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  if (!pick) return { ok: false, error: "no video streams", status: 404 };

  return {
    ok: true,
    id: videoId,
    url: pick.url,
    mime: pick.mimeType,
    expireAt: expireFromUrl(pick.url),
    width: pick.width ?? null,
    height: pick.height ?? null,
    durationSeconds,
  };
}
