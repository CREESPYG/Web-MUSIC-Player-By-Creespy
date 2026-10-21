/**
 * Vercel function entry — /api/innertube, served natively by Vercel's Node
 * runtime. It adapts Vercel's (req, res) signature onto the SAME web-standard
 * dispatcher the Netlify function uses (`netlify/functions/innertube.ts`), so
 * there is exactly one implementation of routing/status/header behaviour:
 *
 *   Vercel   → /api/innertube (this file)
 *   Netlify  → /api/innertube rewritten to /.netlify/functions/innertube
 *   localhost→ /api/innertube served by the Vite dev middleware
 *
 * The dispatcher is loaded via dynamic import inside try/catch so ANY failure
 * (missing module, missing runtime global, resolver crash) surfaces as a JSON
 * body instead of Vercel's opaque FUNCTION_INVOCATION_FAILED 500.
 */

interface VercelReq {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status(code: number): VercelRes;
  setHeader(name: string, value: string): void;
  end(body: Buffer): void;
}

import innertubeHandler from "../netlify/functions/innertube.ts";

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  try {
    const host = typeof req.headers.host === "string" && req.headers.host ? req.headers.host : "localhost";
    const request = new Request(new URL(req.url ?? "/", `http://${host}`), {
      method: req.method ?? "GET",
    });
    const response = await innertubeHandler(request);
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    const e = err instanceof Error ? err : null;
    res.status(500);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(
      Buffer.from(
        JSON.stringify({
          ok: false,
          error: e ? `${e.name}: ${e.message}` : String(err),
          stack: e?.stack ? e.stack.split("\n").slice(0, 8).join(" | ") : undefined,
        })
      )
    );
  }
}
