# CREESPY Player

A single-file React music player built around one embedded YouTube IFrame: incremental list rendering, a single authoritative player engine, room-based sync (Supabase Realtime), WebRTC voice, background keep-alive, touch-first mobile UI, and a fully offline-capable service worker.

## Stack

- Vite 7 + React 19 + TypeScript 5.9 + Tailwind CSS 4 (via `@tailwindcss/vite`)
- `vite-plugin-singlefile` → production output is ONE self-contained `dist/index.html`
- `@supabase/supabase-js` — auth-free anonymous realtime rooms, presence + broadcast
- WebRTC (manual ICE, no STUN/TURN config required) for room voice chat
- vitest for unit tests (`src/lib/*.test.ts`)

## Scripts

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Local dev server                          |
| `npm run typecheck` | `tsc --noEmit` — required before deploy   |
| `npm test`          | vitest unit tests (files in `src/lib`)    |
| `npm run build`     | Production single-file build into `dist/` |
| `npm run preview`   | Serve the built `dist/` locally           |

Every release gate: run `npm run typecheck`, `npm test`, then `npm run build`. Do not ship if any of the three fails.

## Environment variables

Read from `import.meta.env` with hard-coded fallbacks in `src/lib/supabase.ts` — nothing is required for a local build to compile.

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) — publishable/anon key

On Netlify set these three as build-time environment variables. `process.env.NODE_ENV` is replaced by Vite at build time (used to gate service-worker registration).

## Deployment (Netlify)

`netlify.toml` is already in place:

- `command = "npm run build"`, `publish = "dist"`
- Proxy redirects so CORS-restricted music sources keep working in the single-file build:
  - `/api/jiosaavn/*` → `https://www.jiosaavn.com/*` (host header rewritten by Netlify)
  - `/api/spotify-embed/*` → `https://open.spotify.com/embed/*`
  - `/*` → `/index.html` SPA fallback (proxies are matched first, so they are unaffected)

Order matters: the api proxy rules live before the SPA fallback. If you add a new proxied provider, add its rule above the `/*` catch-all.

## Offline / PWA

- `public/sw.js` — service worker: navigations are network-first with a cached-shell fallback; assets use stale-while-revalidate. Registered only in production (`src/main.tsx`).
- Registration is skipped on Netlify only if `serviceWorker` is unavailable; use an incognito tab + hard reload to see updates.
- `public/manifest.json` — PWA manifest (no forced orientation).

## Key architecture invariants

- Single source of truth for playback is `src/hooks/usePlayer.ts` (one `useState`s-deep state object). Chat, rooms and similar lists read from it; nothing mutates playback state except the player hook.
- No true audio cross-fade between tracks in the same YouTube player (IFrame semantics); a brief `<video>`/image crossfade is done for the deck stage.
- Background keepsalive heartbeat is 2.5s (`src/lib/backgroundKeepAlive.ts`); voice participants are pruned after 12s of silence (4 missed beats), room members after a prolonged expiry window.
- Cross-tab identity: `userId()` in `src/lib/room.ts` is browser-level (localStorage) so tabs of one browser collapse into a single room member.
- List rendering is incremental (`useIncrementalList`) so thousands of tracks stay responsive.

## Known limitations

- `bgImport` (background import) lives in memory only — it does not survive a full refresh.
- Same "visitor online" counter is per-tab on purpose; room membership itself is per browser (deduped).
- Two tabs of one browser in the same room share one identity (room membership collapse is desired; a second tab cannot act as a second voice user in the same room).