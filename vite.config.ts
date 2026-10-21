import path from "path";
import { fileURLToPath } from "url";
import type { ServerResponse } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { handleRequest, type RouteRequest } from "./netlify/admin/router";
import { MemoryAdminDb, devSeed } from "./netlify/admin/memory-db";
import { resolveInnertube } from "./netlify/innertube/resolve";
import { searchInnertube } from "./netlify/innertube/search";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function headerValue(req: Connect.IncomingMessage, name: string): string | null {
  const v = req.headers[name];
  if (v == null) return null;
  return Array.isArray(v) ? v.join("; ") : String(v);
}

/**
 * Local dev admin backend — hands /api/admin/* to the real router backed by an
 * in-memory DB so the control plane works under `vite` with no Supabase setup.
 * Production (Netlify) uses SupabaseAdminDb via netlify/functions/admin.ts.
 */
function creespyAdminDev(): Plugin {
  const db = new MemoryAdminDb(devSeed());
  return {
    name: "creespy-admin-dev",
    configureServer(server) {
      server.middlewares.use((req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname;

        // Health is exercised by the SPA boot before login; also lets us skip
        // proxying unrelated api paths (spotify/jiosaavn go to their proxies).
        if (!pathname.startsWith("/api/admin")) return next();

        void (async () => {
          let body: unknown;
          const raw = await readBody(req);
          if (raw) {
            try {
              body = JSON.parse(raw);
            } catch {
              body = undefined;
            }
          }

          const routeReq: RouteRequest = {
            method: (req.method ?? "GET").toUpperCase(),
            path: pathname,
            body,
            cookieHeader: headerValue(req, "cookie"),
            csrfHeader: headerValue(req, "x-csrf-token"),
            ip: headerValue(req, "x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            userAgent: headerValue(req, "user-agent"),
            secure: false, // local http
            now: Date.now(),
          };

          const result = await handleRequest(routeReq, { db });
          res.statusCode = result.status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Content-Type-Options", "nosniff");
          for (const c of result.clearCookies ?? []) res.appendHeader("Set-Cookie", c);
          for (const c of result.setCookies ?? []) res.appendHeader("Set-Cookie", c);
          if (result.retryAfterMs != null && result.retryAfterMs > 0) {
            res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
          }
          res.end(JSON.stringify(result.body));
        })().catch(() => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Internal server error." }));
        });
      });
    },
  };
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

/**
 * Local dev stream resolver — same Innertube resolution the Netlify function
 * runs in production, so `npm run dev` plays music with no extra process.
 */
function innertubeDev(): Plugin {
  return {
    name: "innertube-dev",
    configureServer(server) {
      server.middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/.netlify/functions/innertube") return next();
        try {
          const kind = url.searchParams.get("kind");
          if (kind === "search") {
            const q = url.searchParams.get("q") ?? "";
            const limit = Number(url.searchParams.get("limit")) || 10;
            const search = await searchInnertube(q, limit);
            res.statusCode = search.ok ? 200 : search.status;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify(search));
            return;
          }
          const id = url.searchParams.get("id") ?? "";
          const mediaKind = url.searchParams.get("kind") === "video" ? ("video" as const) : ("audio" as const);
          const result = await resolveInnertube(id, mediaKind);
          res.statusCode = result.ok ? 200 : result.status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(result));
        } catch {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "dev resolver crashed", status: 500 }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), creespyAdminDev(), innertubeDev(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api/spotify-embed": {
        target: "https://open.spotify.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/spotify-embed/, "/embed"),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
      "/api/jiosaavn": {
        target: "https://www.jiosaavn.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/jiosaavn/, ""),
      },
    },
  },
});
