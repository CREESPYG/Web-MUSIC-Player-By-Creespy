/**
 * Stream resolver dispatcher (web-standard Request → Response) — the single
 * implementation every host maps onto the unified client path /api/innertube:
 *   Netlify  → /.netlify/functions/innertube (this file, via netlify.toml rewrite)
 *   Vercel   → api/innertube.ts adapter wraps this file
 *   localhost→ vite.config.ts dev middleware runs the same resolve/search logic
 * Resolves YouTube audio/video stream URLs server-side (same-origin, no CORS);
 * `kind=search` performs a YouTube keyword search (Search screen) the same way.
 */
// ".js" specifiers are required: Vercel executes the traced graph as plain
// Node ESM (no extension inference). Vite/vitest/esbuild/Netlify all map
// "./x.js" back to "./x.ts", so this stays portable everywhere.
import { resolveInnertube, type InnertubeResult } from "../innertube/resolve.js";
import { searchInnertube, type InnertubeSearchResult } from "../innertube/search.js";

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default async function innertubeHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  if (kind === "search") {
    const q = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit")) || 10;
    const result: InnertubeSearchResult = await searchInnertube(q, limit);
    return json(result, result.ok ? 200 : result.status);
  }

  const id = url.searchParams.get("id") ?? "";
  const mediaKind = kind === "video" ? "video" : "audio";
  const result: InnertubeResult = await resolveInnertube(id, mediaKind);
  return json(result, result.ok ? 200 : result.status);
}
