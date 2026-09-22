import { handleRequest, type RouteRequest } from "../admin/router";
import { makeSupabaseClient, SupabaseAdminDb } from "../admin/db";

export const config = { path: ["/api/admin", "/api/admin/*"] };

export default async function adminHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let path = url.pathname;

  // Fallback: if the toml redirect forwarded us (older platforms), the URL
  // points at the function itself — normalize back to the API namespace.
  if (path.includes("/.netlify/functions/")) {
    path = "/api/admin" + path.slice(path.indexOf("/.netlify/functions/") + "/.netlify/functions/admin".length);
  }

  const client = makeSupabaseClient();
  if (!client) {
    return respond(503, { error: "Admin service is not configured." });
  }
  const db = new SupabaseAdminDb(client);

  const seed =
    process.env.ADMIN_INIT_ID && process.env.ADMIN_INIT_PASSWORD
      ? { adminId: process.env.ADMIN_INIT_ID, password: process.env.ADMIN_INIT_PASSWORD, displayName: process.env.ADMIN_INIT_DISPLAY_NAME }
      : undefined;

  let body: unknown;
  try {
    if (request.bodyUsed === false) {
      const raw = await request.text().catch(() => "");
      if (raw) body = JSON.parse(raw);
    }
  } catch {
    body = undefined;
  }

  const req: RouteRequest = {
    method: request.method,
    path,
    body,
    cookieHeader: request.headers.get("cookie"),
    csrfHeader: request.headers.get("x-csrf-token"),
    ip: request.headers.get("x-nf-request-id") ? (request.headers.get("x-forwarded-for") ?? null) : null,
    userAgent: request.headers.get("user-agent"),
    secure: request.url.startsWith("https:") || request.headers.get("x-forwarded-proto") === "https",
    now: Date.now(),
  };

  const result = await handleRequest(req, { db, seed });
  return respond(result.status, result.body, {
    setCookies: result.setCookies,
    clearCookies: result.clearCookies,
    retryAfterMs: result.retryAfterMs,
  });
}

function respond(
  status: number,
  body: unknown,
  opts: { setCookies?: string[]; clearCookies?: string[]; retryAfterMs?: number } = {},
): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const c of opts.clearCookies ?? []) headers.append("Set-Cookie", c);
  for (const c of opts.setCookies ?? []) headers.append("Set-Cookie", c);
  if (opts.retryAfterMs != null && opts.retryAfterMs > 0) {
    headers.set("Retry-After", String(Math.ceil(opts.retryAfterMs / 1000)));
  }
  return new Response(JSON.stringify(body), { status, headers });
}