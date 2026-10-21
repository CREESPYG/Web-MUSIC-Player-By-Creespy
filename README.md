# CREESPY Player — CREEP CREEP

A single-file React music player that plays YouTube through a server-resolved **HTML5 audio engine** (with automatic YouTube IFrame fallback), wrapped in a multi-screen desktop & mobile UI with realtime listening rooms, WebRTC voice chat, public playlists, beat-locked visuals, a serverless admin control plane, and a Capacitor Android shell.

## Current feature set

### Playback engine (`src/hooks/usePlayer.ts` — single source of truth)

- **Dual engine, one authority.** Primary engine is a shared `HTMLAudioElement` fed by server-resolved YouTube stream URLs → native Range seeking, true background audio, no iframe jank. If stream resolution fails (or a mid-play 403/expiry occurs), the player invalidates the cache and falls back to the official **YouTube IFrame API** automatically.
- Transport: play/pause, next/prev (playable-track skipping), seek, volume, mute, playback-rate cycle; repeat **one / all / off**; shuffle **off / random / magic**.
- **Magic shuffle** — similarity-scored auto-discovery (`fetchSimilar` + `pickMagicIndex`): keeps the queue topped up to 24 tracks (45s cadence while playing), counts each track once per run, then auto-stops.
- **Up Next auto-queue** — when ≤3 tracks remain (non-magic), one vetted suggestion is appended; **autoplay resume** fetches a fresh batch of 4 after an auto-stop. Both gated on online status + persisted preferences, so manual sessions are never interrupted.
- **Session restore** — last queue (rebuilt from playlists + custom tracks), exact track, position, and paused/playing flag survive refresh; commit-gated cue + deferred-seek heal (no race with the boot queue); saves every 10s, on pause, on track change, and on unload.
- **MediaSession** metadata + play/pause/next/prev/seek±10 actions, with hardware media-key (keydown) fallback; wake lock while playing; iOS silent-audio keepalive; 2.5s background keep-alive heartbeat.
- Adaptive progress poll (500ms playing / 1,500ms paused) that also drives the magic top-up timer.

### Library, search & playlists

- **Multi-screen navigation** (no sidebars): `player · library · rooms · history · settings · search` on desktop (persisted `activeScreen`); dedicated mobile shell with bottom tabs + more-sheet (player, queue, playlists, rooms, clock, customization).
- **Library screen** — your playlists, liked tracks, and history with detail views; grid/box layouts; create playlists; **collection + community tabs** with pinned global playlists.
- **Search** — same-origin **YouTube keyword search via server-side Innertube** (no API key, no CORS, 5s timeout, graceful fallback to public instances); mixed song + YouTube-playlist results; filters for local queue / your playlists / community / rooms; save results as a playlist, add-to-playlist, create-and-add; import / play / queue YouTube playlists directly from results.
- **Playlist importers** for YouTube (videos + playlists), JioSaavn, Spotify, and SoundCloud through a normalized `Track` model (`source`/`resolver` status; unresolved tracks stay visible and are skipped by the player).
- **Public playlists** — publish/unpublish to Supabase with like counts, play counts, and realtime subscriptions; server-enforced ownership (anonymous auth + `owner_uid`, RLS-ready).
- Custom user queue persisted (`creespy-user-tracks-v1`); incremental list rendering (`useIncrementalList`) keeps 1,000+ track queues responsive.

### Rooms, chat & voice

- **Realtime listening rooms** (Supabase Realtime presence + broadcast, auth-free): public/private rooms, live directory, invite links (`?room=CODE`) with auto-join, live chat.
- **Playback sync** — timestamp-based (`serverTime + startedAt + position`) with periodic correction; no per-frame DB writes.
- **Lifecycle hardening** — heartbeat/lastSeen lease, tab-switch leave, ghost-channel guards, host-death successor election, 5–10 min grace period so a quick reload doesn't kill the room; host permissions matrix + per-user volume.
- **WebRTC voice** — mesh audio, SDP/ICE signaling over Supabase broadcast, mute/deafen/speaking indicator, STUN by default, TURN via `VITE_TURN_*` env (temporary credentials only), TTL pruning of dead participants.
- **Cross-tab identity** — browser-level `userId()` so tabs of one browser collapse into a single room member.

### Visuals, beat & customization

- **Backgrounds** — Dynamic (cosmic orbs/mesh), Wave (audio-reactive sine), Solid, or Media (custom wallpaper/image/video library stored in IndexedDB + background import); **live wallpaper video** is a real `<video>` element fed by Innertube video streams (`useLiveBgVideo`).
- **FX modes** — Full, Spectrum (wavy music bars), Aurora, Wave, Orbs, Stardust, Minimal; movement levels OFF → MINIMAL → BALANCED → DYNAMIC → IMMERSIVE with speed/intensity/particles.
- **Vinyl disc stage** — 72-bar mirrored inner+outer spectrum with per-bar sway, themed downbeat ring, 30fps throttled and resting-state aware.
- **Beat system** — drift-corrected clock (500ms poll absorbed smoothly, real seeks re-anchor), calibration sliders (tempo ±30%, phase ±250ms, RESET), and **TAP-to-lock** real BPM from 4 taps (45–200 BPM) with live BPM readout, shared by all FX and disc bars.
- Themes + single accent with derived accent scale; OLED-dark minimal-premium design tokens; versioned persisted settings with safe migration; DigitFlipper clock/timestamps; flip clock with world timezone + weather; Focus Pomodoro with ambient presets; sleep timer.
- Accessibility: `prefers-reduced-motion` respected everywhere, `:focus-visible` accent outline, 320px-safe layouts, `100dvh` mobile viewport, touch-first targets.

### Resilience & quality

- **PWA/offline** — network-first shell + stale-while-revalidate assets service worker (production-only), manifest, offline/online toasts, guarded fetches; discovery pauses offline.
- **Section-level `ErrorBoundary`** around settings/rooms/search/history/library so one broken panel never takes down the player.
- **Memory governor** (blob-URL tracking + autonomous sweeps), React.memo + refs for animation, listeners/timers cleaned up — no duplicate audio, peers, or subscriptions.
- Console hygiene: no `console.error`/`console.log`/TODO in `src` (only intentional `console.warn` on degraded paths).

### CREESPY Admin control plane (`/creespy/admin`)

- Netlify Functions as the server-side enforcement layer: **scrypt auth**, rotating 256-bit sessions (sha256-only stored), HttpOnly/Secure/SameSite=Strict cookies, CSRF double-submit, progressive lockout (5→30s→15min), forced password change, append-only audit log.
- **RBAC** — SUPER_ADMIN / ADMIN / MODERATOR / ANALYST least-privilege matrix, per-endpoint `requirePermission` gate, SUPER_ADMIN suicide-guard, audited denials.
- **Dashboard** — server-computed live cards via a single `admin_dashboard_live()` SECURITY DEFINER RPC, role-scoped routes, 60s stale-token refresh, logout-anywhere on session expiry.
- **Reports & actions** — users, admins (create w/ one-time temp password), sessions (revoke), playlists (hide/unhide/remove, additive `hidden` column), songs analytics, traffic + CSV export, imports/resolution monitoring, system health, error center, perf/hot-path index report; honest realtime-only placeholders for rooms/chat/voice (they are broadcast-only, never persisted).
- Local dev: Vite middleware maps `/api/admin/*` to an in-memory DB with seeded login/CSRF.

### Android (Capacitor 8)

- Capacitor Android project committed under `android/` — appId `com.creepcreep.musicplayer`, app name **CREEP CREEP**, `webDir: dist`, https scheme + cleartext allowed, dark splash screen, web debugging disabled for release.

## Stack

- Vite 7 + React 19 + TypeScript 5.9 + Tailwind CSS 4 (via `@tailwindcss/vite`)
- `vite-plugin-singlefile` → production output is ONE self-contained `dist/index.html` (current: ~1,268 kB / gzip ~332 kB)
- `@supabase/supabase-js` — auth-free anonymous realtime rooms, presence + broadcast, public playlists
- Capacitor 8 (`@capacitor/android`, `@capacitor/app`) — Android wrapper
- WebRTC (manual ICE, no STUN/TURN config required) for room voice chat
- vitest — **96 tests across 7 files** (`media`, `persistence`, `integration`, `useBeat`, admin `core`/`rbac`/`router`)

## Scripts

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Local dev server (stream resolver included via Vite middleware) |
| `npm run typecheck` | `tsc --noEmit` — required before deploy   |
| `npm run lint`      | Alias of typecheck (strict TS = lint); no ESLint vendored to keep the single-file build lean |
| `npm test`          | vitest unit tests (`src/**` + `netlify/**`) |
| `npm run build`     | Production single-file build into `dist/` |
| `npm run preview`   | Serve the built `dist/` locally           |

**Release gate (every release):** `npm run typecheck` (or `lint`) → `npm test` → `npm run build`. Do not ship if any of the three fails.

## Stream resolver & search (Innertube function)

Playback and search go through one same-origin serverless endpoint — **no YouTube API key, no CORS issues**:

- `/api/innertube?kind=audio&id=<videoId>` → audio stream URL + expiry + duration
- `/api/innertube?kind=video&id=<videoId>` → video stream URL (live wallpaper)
- `/api/innertube?kind=search&q=<query>&limit=10` → keyword results (songs + playlists)

Client side (`src/lib/streamResolver.ts`) caches URLs until ~1 minute before expiry and invalidates on mid-play failure; the player then falls back to the IFrame engine. The client always calls **`/api/innertube`**, which every host maps onto the same implementation:

- **Vercel** → `api/innertube.ts` (native function, wraps the shared dispatcher)
- **Netlify** → `netlify.toml` rewrites `/api/innertube` → `/.netlify/functions/innertube`
- **localhost** → `vite.config.ts` dev middleware runs the same resolve/search logic

`vite.config.ts` mounts the exact same resolver/search as dev middleware, so `npm run dev` plays music with no extra process.

## Environment variables

Read from `import.meta.env` with hard-coded fallbacks in `src/lib/supabase.ts` — nothing is required for a local build to compile.

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`) — publishable/anon key
- `VITE_TURN_*` (optional) — TURN credentials for voice behind strict NATs; **temporary credentials only** (client bundle)

On Netlify set the build-time variables above. `process.env.NODE_ENV` is replaced by Vite at build time (used to gate service-worker registration).

## Admin Control Plane (Netlify Functions)

The `/creespy/admin` control plane runs as Netlify Functions (server-side). It is a fully isolated code island — if the admin service or its env is misconfigured, the player site still boots unchanged.

Server-side env vars (set in Netlify **Function settings** — never a `VITE_*` prefix, never in the client bundle):

- `SUPABASE_URL` — same project URL as the player
- `SUPABASE_SERVICE_ROLE_KEY` — privileged key, server-only, for admin tables
- `ADMIN_INIT_ID` / `ADMIN_INIT_PASSWORD` — one-time bootstrap credentials (password is scrypt-hashed server-side at first login, then **delete these two vars** from Netlify); `ADMIN_INIT_DISPLAY_NAME` optional

First deploy flow: run `supabase/admin_schema.sql` in the SQL editor → set the four env vars → deploy → open `/creespy/admin` → sign in (forces a password change) → remove `ADMIN_INIT_*`. No admin password or hash ever ships in the client bundle or repo.

## Deployment (Netlify)

`netlify.toml` is already in place:

- `command = "npm run build"`, `publish = "dist"`
- Proxy redirects so CORS-restricted music sources keep working in the single-file build:
  - `/api/jiosaavn/*` → `https://www.jiosaavn.com/*` (host header rewritten by Netlify)
  - `/api/spotify-embed/*` → `https://open.spotify.com/embed/*`
  - `/api/admin/*` → `.netlify/functions/admin` (admin control-plane API)
  - `/api/innertube` → `/.netlify/functions/innertube` (unified resolver path, maps to the function)
  - `/*` → `/index.html` SPA fallback (proxies are matched first, so they are unaffected)
- The Innertube dispatcher ships as `netlify/functions/innertube.ts` and is served automatically at `/.netlify/functions/innertube`; the client's unified `/api/innertube` path is rewritten there.
- Admin API responses are sent with `no-store` + nosniff/DENY headers; the admin page is never cached.

Order matters: the api proxy rules live before the SPA catch-all. If you add a new proxied provider, add its rule above the `/*` catch-all.

## Deployment (Vercel)

Import the GitHub repo in Vercel — no config needed beyond `vercel.json` (already committed):

- Build: `vite build` (auto-detected), output `dist/` (single-file `index.html`).
- `api/innertube.ts` is served natively at `/api/innertube` — YouTube search, stream resolution and the live wallpaper work out of the box (keyless, no env vars).
- `vercel.json` rewrites `/.netlify/functions/innertube` → `/api/innertube` (legacy path) and everything outside `/api/*` → `/index.html` (SPA fallback, same as Netlify's `/*` rule).
- **Note:** the admin control plane (`/creespy/admin` + `/api/admin/*`) is **Netlify-only** — the admin functions do not exist under `api/`, so on Vercel the admin island loads but cannot authenticate. The player site itself is unaffected.

## Android build (Capacitor)

```bash
npm run build          # produce single-file dist/
npx cap sync android   # copy dist + config into android/
npx cap open android   # Android Studio → Run, or: cd android && gradlew assembleDebug
```

The `android/` project is committed with its standard `.gitignore` (build outputs, `local.properties`, keystores are excluded).

## Offline / PWA

- `public/sw.js` — service worker: navigations are network-first with a cached-shell fallback; assets use stale-while-revalidate. Registered only in production (`src/main.tsx`).
- Registration is skipped on Netlify only if `serviceWorker` is unavailable; use an incognito tab + hard reload to see updates.
- `public/manifest.json` — PWA manifest (no forced orientation).

## Key architecture invariants

- Single source of truth for playback is `src/hooks/usePlayer.ts` — chat, rooms, and similar lists read from it; nothing mutates playback state except the player hook. The stream engine and iframe engine are swappable implementations behind that one hook.
- Stream URLs are resolved server-side and cached client-side until expiry; a failed/expired stream invalidates once, then the iframe engine takes over — playback degrades, it does not crash.
- No true audio cross-fade between tracks (engine semantics); a brief `<video>`/image crossfade is done for the deck stage.
- Background keepsalive heartbeat is 2.5s (`src/lib/backgroundKeepAlive.ts`); voice participants are pruned after 12s of silence (4 missed beats); room members use a lease/heartbeat window with host-successor election.
- Cross-tab identity: `userId()` in `src/lib/room.ts` is browser-level (localStorage) so tabs of one browser collapse into a single room member.
- List rendering is incremental (`useIncrementalList`) so thousands of tracks stay responsive.
- Admin plane is a separate code island: every admin decision (auth, session, authz, CSRF, rate-limit) happens server-side; the player never depends on admin availability.

## Tests

`npm test` — **96/96 passing** across 7 files:

- `src/lib/media.test.ts` — parsing, normalization, similarity/magic indexing, search fallbacks
- `src/lib/persistence.test.ts` — central store, playlists, history, last-played round-trips
- `src/lib/integration.test.ts` — cross-module seams (import→normalize→queue, resolver versions, session restore, room channel identity, invite links, browser userId, fuzzy similarity)
- `src/hooks/useBeat.test.ts` — tempo timing, phase shift, BPM re-anchor / tap-to-lock
- `netlify/admin/core.test.ts` — scrypt auth, sessions, CSRF, lockout, audit invariants
- `netlify/admin/rbac.test.ts` — role matrix, endpoint gates, suicide-guard
- `netlify/admin/router.test.ts` — routing, method/CSRF enforcement, error shapes

## Known limitations

- `bgImport` (background import) lives in memory only — it does not survive a full refresh (library items stored in IndexedDB do).
- Innertube is an unofficial YouTube endpoint: URLs expire (~hours) and the protocol can change — the client caches until expiry, invalidates on failure, and falls back to the official IFrame engine.
- Rooms, chat, and voice are realtime-only (broadcast/presence) — never persisted, so the admin plane honestly reports them as unavailable instead of inventing data.
- Room voice is a WebRTC mesh (no SFU): fine for small rooms, not for large calls.
- Same "visitor online" counter is per-tab on purpose; room membership itself is per browser (deduped).
- Two tabs of one browser in the same room share one identity (room membership collapse is desired; a second tab cannot act as a second voice user in the same room).
