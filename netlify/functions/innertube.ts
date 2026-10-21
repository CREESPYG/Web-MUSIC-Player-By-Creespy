/**
 * Stream resolver function — the web app fetches /.netlify/functions/innertube
 * (same-origin, no CORS) to resolve YouTube audio/video stream URLs server-side,
 * the way musike resolves them through its Fastify backend.
 * `kind=search` performs a YouTube keyword search (Search screen) the same way.
 */
import { resolveInnertube, type InnertubeResult } from "../innertube/resolve";
import { searchInnertube, type InnertubeSearchResult } from "../innertube/search";

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
