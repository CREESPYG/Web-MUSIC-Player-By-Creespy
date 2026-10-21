/**
 * Vercel function entry — /api/innertube, served natively by Vercel's Node
 * runtime. It adapts Vercel's (req, res) signature onto the SAME web-standard
 * dispatcher the Netlify function uses (`netlify/functions/innertube.ts`), so
 * there is exactly one implementation of routing/status/header behaviour:
 *
 *   Vercel   → /api/innertube (this file)
 *   Netlify  → /api/innertube rewritten to /.netlify/functions/innertube
 *   localhost→ /api/innertube served by the Vite dev middleware
 */
import innertubeHandler from "../netlify/functions/innertube";

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

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  const host = typeof req.headers.host === "string" && req.headers.host ? req.headers.host : "localhost";
  const request = new Request(new URL(req.url ?? "/", `http://${host}`), {
    method: req.method ?? "GET",
  });
  const response = await innertubeHandler(request);
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
