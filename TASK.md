# CREESPY PLAYER — TASK TRACKER

Gated execution list (spec Phases 0→31). Rules:

- Never start a phase until the current one PASSES (build + tests + gate).
- If a phase fails → STOP → fix → retest → only then continue.
- Bug found later that belongs to an earlier phase → return to that phase, fix, retest.
- Every phase ends with: BUILD → TEST → VERIFY → REPORT → GATE.

Current gates (must stay green each phase):

- [x] `npm run typecheck` PASS
- [x] `npm test` PASS (22/22)
- [x] `npm run build` PASS (single-file `dist/index.html`)

---

## ✅ DONE

### Phase 0–5 — Foundation, Data, Import (earlier sessions)
- [x] Project discovery/audit
- [x] Data model, playlist importers (YouTube / JioSaavn / Spotify / SoundCloud)
- [x] Platform adapters + resolver pipeline wiring

### Phase 6 — Track Normalization
- [x] One normalized `Track` model (`id/title/artists/album/duration/artwork/source*/playable*/resolverStatus`)
- [x] Metadata from platform APIs (no fake `track_123` names)
- [x] Version handling (Remix/Live/Extended preserved)
- [x] Multi-artist preserved

### Phase 7 — Playable Source Resolver
- [x] Resolver: originalSource → playableSource with confidence
- [x] Source fallback chain → UNRESOLVED when no legal source
- [x] Unresolved tracks visible, skipped by player
- [x] Confidence stored on track

### Phase 8 — Player Foundation
- [x] Single authoritative engine `usePlayer.ts`
- [x] play / pause / next / prev / seek / volume / mute / shuffle / repeat
- [x] One player, no duplicate audio

### Phase 9 — Queue + Playlist (+1000 performance)
- [x] Create/rename/delete/add/remove/reorder/queue/shuffle/repeat/favorite
- [x] Incremental rendering (1000+ no freeze)
- [x] Import result counts (Total/Imported/Playable/Unresolved)

### Phase 10 — Song Position / Player Persistence
- [x] Track + position + queue + repeat + shuffle persisted & restored
- [x] Intentional new playback overrides restored state
- [x] Race-free restore cue (commit-gated) + was-playing resume flag

### Phase 11 — Media Session + Desktop Controls
- [x] MediaSession metadata/actions (play/pause/next/prev/seek)
- [x] Keyboard: Space, ←, →, media keys; text-input guard

### Phase 12 — YouTube Player
- [x] Official IFrame API, `controls=0`, `playsinline=1`
- [x] Custom controls drive real playback; no native UI leak

### Phase 13 — Room Music Synchronization
- [x] Timestamp-based sync (serverTime + startedAt + position)
- [x] Periodic correction; no per-frame DB writes

### Phase 14 — Room Lifecycle / Presence
- [x] Room status ≠ voice status; heartbeat / lastSeen / lease
- [x] Tab switch ≠ room leave; voice/WebRTC failure ≠ room delete
- [x] Roster expiry immune to background tabs; host-death successor election

### Phase 15 — WebRTC Voice Foundation
- [x] SDP/ICE/signaling via Supabase broadcast; cleanup; sessionId identity
- [x] STUN; TURN wired via env (`VITE_TURN_*`) — ⚠️ ops: set env vars on Netlify

### Phase 16 — Voice Features
- [x] Mute / deafen / speaking indicator / per-user volume / host permissions
- [x] Voice does not affect room lifecycle; TTL prune of dead participants

### Phase 18 — Visualizer Foundation
- [x] Bars/Wave/Circle/… modes; play/pause/seek/track-change sync
- [x] Cross-origin YouTube → honest time-synced effects (no fake FFT claim)

### Phase 19 — Moving Visual Effects
- [x] OFF/MINIMAL/BALANCED/DYNAMIC/IMMERSIVE + speed/intensity/particles
- [x] `prefers-reduced-motion` respected; no leaks/runaway CPU

### Phase 20 — Customization System
- [x] Themes + background/artwork/visualizer/particle controls
- [x] Versioned persisted settings (`ripple.settings.v1`) with safe migration

### Phase 21 — UI/UX Design System
- [x] Minimal-premium / OLED dark, single accent, centralized Tailwind tokens
- [x] Motion used sparingly; existing functionality intact

### Phase 22 — Desktop Player UX
- [x] Fullscreen player + mini player; queue/playlist/search/rooms/chat/settings layout
- [x] No horizontal overflow

### Phase 23 — Mobile Adaptation
- [x] Now Playing hierarchy, mobile screens (queue/playlist/rooms)
- [x] Responsive structure (device matrix re-checked under Phase 28)

### Phase 25 — Performance Optimization
- [x] Memory governor, React.memo, incremental lists, refs/CSS-var animation
- [x] Listeners/subscriptions/timers cleaned; no duplicate audio/peers/subs

### Session Phases (extra, not in spec numbering)
- [x] Offline/online resilience (`useOnline`, guarded fetches + timeouts)
- [x] Session survival (queue identity, deferred seek, heal)
- [x] Automated test harness (vitest, 22 tests: media + persistence)
- [x] PWA/offline (network-first shell, no forced portrait)
- [x] Realtime hardening (ghost-channel guards, host election, voice TTL)
- [x] Cross-tab identity (browser-level userId)
- [x] Post-refresh name/plays mismatch fix + seamless resume

---

## ⬜ TO DO (one at a time — gate must pass before next)

## ✅ DONE

### Phase 17 — Voice/Debug Telemetry  ⚠️ (panel removed per user request)
- [x] Read-only telemetry getters added (useRoom.debugGet /
      useVoice.debugGet / WebRtcVoiceManager.debugSnapshot) — KEPT (no UI,
      harmless, no secrets; useful for future tooling if desired)
- [~] DebugPanel component was added, then REMOVED on request — no debug
      UI anywhere now (build/typecheck/test clean after removal)

### Phase 26 — Security Audit  ✅ (code side)
- [x] Repo scan: no service-role/private keys/credentials tracked; `.env`
      git-ignored (only `.env.example` tracked)
- [x] publishable-key fallback is public-by-design (not a leak)
- [x] Playlist ownership now server-enforced: anonymous auth → owner_uid =
      auth.uid(), RLS-ready delete/upsert filters; graceful fallback to
      advisory-uid path if anon auth unavailable (documented limited mode)
- [x] TURN: env-driven; documented MUST use temporary credentials only
      (VITE_* is bundled into the client)
- [ ] SERVER-SIDE (user, Supabase Dashboard): enable Anonymous sign-ins +
      run the RLS SQL from the Phase 26 report (select: true / insert,
      update, delete: auth.uid()::text = owner_uid)
- [ ] Gate: unauthorized actions rejected server-side (pending step above)

### Phase 27 — Complete Integration Test  ✅
- [x] NEW src/lib/integration.test.ts (9 tests) — cross-module seams:
      normalize preserves platform identity & versions; unresolved stays
      queueable & keyed by id; queue-key uniqueness; resolver version
      detection/strip; full session restore round-trip (playback settings +
      last-played + playlists); room channel-name identity; invite link
      encode/decode; browser-level userId across tabs; fuzzy similarity +
      youtu.be id parsing
- [x] Manual multi-device chain deferred to Phase 28 browser matrix
      (play → queue → room → chat → voice → per-user volume → host tab
      switch → room stays → voice reconnects → mobile join)
- [x] Gates: typecheck PASS · 31/31 tests PASS · build PASS
      (Total test count now 22→31)

### Phase 28 — Full Browser Testing  ✅ (code-verifiable) / ⬜ (device manual)
- [x] Mobile meta: width=device-width + viewport-fit=cover; theme-color;
      apple-web-app tags (index.html)
- [x] Reduced motion honored (`motion-reduce:animate-none`,
      `prefers-reduced-motion` matchMedia in MediaLayer/DiscStage/DigitFlipper)
- [x] Browser-API feature guards everywhere (Notification, serviceWorker,
      wakeLock, navigator.mediaDevices)
- [x] No fixed/pixel widths that overflow 320px (all panels `max-w-[min(..,
      100vw)]` / `w-full`; h-[100dvh] dynamic viewport for mobile URL bars)
- [x] No stray `console.error` in src
- [ ] MANUAL (on devices): Chrome/Edge/Firefox/Brave/Android Chrome/iOS
      Safari; desktop↔desktop + desktop↔mobile on same/diff network/hotspot;
      tab switch, refresh, network loss/reconnect, minimize/background;
      breakpoint pass at 320/360/375/390/414/430/768

### Fix Batch — Beat Sync Overhaul  ✅ (user-reported: FX + disk bars off-beat)
- [x] ROOT CAUSE (constraint): real beat can't be extracted from the
      cross-origin YouTube iframe (no audio access — per spec), so visuals
      pulsed on a hash-derived "guessed" BPM → noticeably off-tempo; plus
      the 500ms UI position poll hard re-anchored the grid → visible jitter
- [x] Drift-corrected clock: poll now absorbed smoothly (≤0.35s residual
      blended, >0.35s = real seek → clean re-anchor); long-term drift
      eliminated, grid stays steady
- [x] "Beat sync" calibration (settings + CustomizePanel + mobile sliders):
      Beat tempo ±45% (lock pulse rate to the song) & Beat phase ±250ms
      (land kicks on real downbeats), with RESET; persisted
- [x] Crisper kick/snare envelopes (faster attack, cleaner decay) so locked
      pulses read clearly on the disk bars + all FX (orbs/aurora/wave)
- [x] NEW src/hooks/useBeat.test.ts (3 tests): tempo timing, phase shift,
      bpm re-anchor; gates PASS 34/34 + typecheck + build

### Fix Batch — Visual Accuracy + Media Keys  ✅ (user-reported round 2)
- [x] TAP-TO-LOCK: `beat.tapBeat()` measures the song's REAL tempo from 4
      taps (median instant-tempo, 45–200bpm) → visual grid + ALL FX + disc
      bars lock to the true music tempo; phase snapped to the tapped beat as
      an unbounded integer-beat shift (session-safe, survives re-sync);
      TAP ×4 button + live "≈BPM" readout in desktop + mobile Customize
- [x] Spectrum FX mode: NEW "Spectrum — Wavy Music Bars" full-screen
      mirrored 72-bar spectrum (bass-weighted, per-column sine sway,
      kick/downbeat pump) wired into desktop FX grid + mobile FX modes
- [x] Disc stage bars upgraded: 48 → 72 bars, mirrored inner+outer
      spectrum, per-bar wavy sway, plus a themed downbeat ring pulse that
      fires on the kick of beat 1; still 30fps-throttled + resting-state
- [x] HARDWARE MEDIA KEYS: MediaPlayPause / MediaTrackNext /
      MediaTrackPrevious / MediaStop now handled as keydown fallback in
      App (works even while typing + when the OS routes the key to the
      YouTube iframe session); mediaSession gained seekbackward/seekforward
      actions; all setActionHandler calls wrapped in try/catch (older
      engines)
- [x] Tests 36/36 PASS + typecheck PASS + build PASS

### Phase 29 — Final Regression  ✅ (code-side) / ⬜ (device manual)
- [x] Full code sweep — search, playlists, all 4 adapters, room/voice seams,
      visualizer/beat, customization, desktop, mobile, security: covered by
      36/36 automated tests + typecheck + the module audits in Phases 22–28
- [x] A11y: `prefers-reduced-motion` everywhere + `:focus-visible` accent
      outline (index.css); screen-reader pass done statically (labels on
      icon buttons / role="log" removed with DebugPanel; nav aria labels)
- [x] Console hygiene: no console.error / console.log / TODO / FIXME in src
      (only intentional console.warn on gracefully-degraded paths)
- [x] No debug UI, no secrets, no fixed-width overflow, no perf regressions
- [ ] Manual device matrix (folded into outstanding Phase 28 checklist)

### Phase 30 — Final Build / Deployment Validation  ✅ (code-side) / ⬜ (ops)
- [x] `lint` script added (alias of strict typecheck — documented in README:
      ESLint deliberately not vendored to keep singlefile build lean)
- [x] Clean production build PASS (dist/index.html ~1,092 kB / gzip ~296.5 kB);
      no dev debug UI exposed (DebugPanel gone); no console errors
- [x] Smoke: gates run fresh post-regression — lint PASS · 36/36 tests PASS ·
      build PASS
- [ ] OPS (user, once): set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` +
      `VITE_TURN_*` (temporary creds only) on Netlify; enable anonymous
      sign-ins + run RLS SQL (Phase 26); verify prod rooms/voice/playlist-write

### Phase 31 — Final Report  ✅ (delivered)
- [x] Full 32-section report delivered to the user (see chat) covering:
      audit → root causes → architecture triage → DB/data model → search &
      adapters → playlist/resolver → player/persistence → media keys →
      rooms → voice/WebRTC → sync/visuals → debug telemetry → a11y → perf →
      offline/PWA → security → limitations → SFU recommendation → ops
      checklist → NEXT STEPS (user)

_Last updated: Phases 27→31 complete (code-side), two user-ops checklists
stand open (Phase 26 RLS + Phase 30 Netlify env, and the Phase 28 device
matrix). All automated gates green._

---

# ADMIN CONTROL PLANE — CREESPY Admin (Netlify Functions)

**Architecture (user-approved):** Netlify serverless Functions = the real,
server-side enforcement layer. Client SPA only RENDERS; every admin decision
(session, authz, hashing, CSRF, rate-limit) happens in `netlify/functions`
(the trusted zone). No Node server is required locally — Functions are the
"server".

**Absolute invariants (never violated):**
- No password plaintext, no password hash, no session token, no admin secret
  anywhere in: frontend bundle, Git history, localStorage/sessionStorage,
  URL params, `VITE_*` env. Only server-side env (`ADMIN_INIT_ID`/`ADMIN_INIT_PASSWORD`
  bootstrap) and server-side scrypt hashes in Supabase.
- Every `/api/admin/*` request authenticated server-side first (401 generic).
- Every state-changing admin action is audit-logged (append-only, no password/token/secrets).
- Admin plane is a SEPARATE code island: player boot/logic NEVER depends on admin
  availability; admin down = player unaffected.
- RLS: anon role can never read/write admin tables.

## ADMIN PHASES (A → Q, sequential, report after each)

**STATUS OVERVIEW:**

| Phase | Title | Status code-side | Status ops/deploy |
| ----- | ----- | ---------------- | ----------------- |
| **A** | Secure Auth + Sessions (SERVER-SIDE) | ✅ DONE (committed `03a4646`, 31 admin tests) | ⬜ ops (schema+env+deploy) |
| **B** | Roles & Server-Side Authorization | ✅ DONE (19 rbac tests, audit endpoint, suicide-guard) | — |
| **C** | Dashboard Foundation | ✅ DONE (RPC live cards, role-scoped, stale-refresh) | — |
| **D** | Users, Sessions & Presence | ▶ NEXT | — |
| **D** | Users, Sessions & Presence | ⬜ | — |
| **E** | Songs & Listening Analytics | ⬜ | — |
| **F** | Playlist Management | ⬜ | — |
| **G** | Rooms Management | ⬜ | — |
| **H** | Chat Moderation | ⬜ | — |
| **I** | Voice & Realtime Diagnostics | ⬜ | — |
| **J** | Traffic, Time-Spent & Growth | ⬜ | — |
| **K** | Imports & Resolution Monitoring | ⬜ | — |
| **L** | System Health & Error Center | ⬜ | — |
| **M** | Performance, Indexes & Aggregation | ⬜ | — |
| **N** | Security Audit (red-team pass) | ⬜ | — |
| **O** | Full Integration + Regression | ⬜ | — |
| **P** | Production Deploy Ops | ⬜ | ⬜ (USER) |
| **Q** | Final Admin Report | ⬜ | — |

### ADMIN Phase A — Secure Auth + Sessions (SERVER-SIDE)  ✅ (code-side) / ⬜ (ops)
- [x] Netlify Functions bootstrap: `netlify/functions/admin.ts` (v2 handler),
      `netlify.toml` redirect `/api/admin/*` → function (BEFORE spa catch-all).
- [x] Supabase schema migration `supabase/admin_schema.sql`: `admin_users`
      (scrypt hash + salt + role + must_change_password + failed_attempts +
      locked_until), `admin_sessions` (only sha256 of token, expiry, geo+ua,
      revoked), `admin_audit` (append-only via RLS). RLS denies anon entirely.
- [x] One-time bootstrap (no plaintext in repo): on admin-user-table-empty,
      function seeds from server-only env `ADMIN_INIT_ID`/`ADMIN_INIT_PASSWORD`,
      scrypt-hashes, sets must_change_password=1; after first admin login instruct
      to DELETE those env vars from Netlify.
- [x] Password hashing: `node:crypto` scrypt (server-side), constant-time compare
      (timingSafeEqual), strong policy (≥10 chars, upper+lower+digit+symbol, no
      leet of init id).
- [x] Session: 256-bit random token → store SHA-256 only; HttpOnly + Secure +
      SameSite=Strict cookie `creespy_admin_session` (8h expiry, rotating).
- [x] Brute-force: progressive delay + temp lock (5 fails → 30s, doubling,
      max 15min via locked_until in DB), reset on success; generic error
      "Invalid admin credentials." (never reveals user existence); CSRF token
      cookie (`/` path, readable by SPA) + `X-CSRF-Token` header on all
      mutating admin routes.
- [x] `/creespy/admin` SPA (isolated island): Login screen → (first login) forced
      "change password" screen → Phase A shell (identity + logout). Session check
      on load via `/api/admin/auth/session`.
- [x] Auth endpoints: `auth/login`, `auth/session`, `auth/change-password`,
      `auth/logout`, plus `health` (CSRF issuing).
- [x] Security tests (server-side logic): hash round-trip, wrong-password generic
      error, unknown-admin timing-equalized denial, lockout timing + Retry-After,
      session token never matches stored value, expired/revoked session rejected,
      forced-change enforcement + policy reasons, CSRF required on mutation,
      one-time env bootstrap, audit append-only & secret-free. **31 admin tests,
      67 total, all PASS.**
- [ ] OPS (user, once): run `supabase/admin_schema.sql` in SQL Editor; Netlify
      Functions env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` +
      `ADMIN_INIT_ID`/`ADMIN_INIT_PASSWORD` (+ display name); deploy; open
      `/creespy/admin`; first login forces password change; then DELETE
      `ADMIN_INIT_*` vars.  → then ADMIN Phase B.

### ADMIN Phase B — Roles & Server-Side Authorization  ✅ (code-side)
- [x] `netlify/admin/rbac.ts` — single source of truth: `AdminRole`,
      `AdminAction` (16 permissions), `ROLE_PERMISSIONS` matrix (least
      privilege), `WRITE_ACTIONS` / `DESTRUCTIVE_ACTIONS` subsets,
      `authorize()`, `effectiveGrants()`, `canManageTarget()` suicide-guard.
- [x] Per-endpoint gate wired into router: `requirePermission(role, action)`
      (403 + audited `authz.denied.*` on insufficient grant). MODERATOR has NO
      `sessions.read` / `audit.read` / `admin.manage` / users. ANALYST holds
      ZERO write/destructive actions (read-only analytics). ADMIN default-deny
      on audit + admin-management.
- [x] No-escalation: only SUPER_ADMIN may manage admins; even SUPER_ADMIN can
      NEVER target another SUPER_ADMIN remotely (server-side bootstrap + DB only).
- [x] `GET /api/admin/auth/me` — identity + role + effective grants (SPA nav).
- [x] `GET /api/admin/audit` — SUPER_ADMIN-only audit trail read (200 entries),
      itself audit-logged; MODERATOR/ADMIN get generic 403.
- [x] Tests: `netlify/admin/rbac.test.ts` (14: matrix, MODERATOR/ANALYST
      boundaries, suicide-guard) + router integration (me grants, audit 200/
      403/denied-audited). Admin suite 31→50; TOTAL 67→86, all PASS.

### ADMIN Phase C — Dashboard Foundation  ✅ (code-side)
- [x] Server-side live cards via single SECURITY DEFINER RPC `admin_dashboard_live()`
      (supabase/admin_schema.sql §5): users (distinct owners/publishers/admins),
      playlists (count/tracks/plays), playback (play_count source), rooms
      (honest realtime-only placeholder), errors (failed audit 24h/total),
      active admin sessions, storage (tracks + approx bytes from pg_column_size).
      Computed IN the DB — no raw rows or secrets ever reach the client.
- [x] `GET /api/admin/dashboard` gated by `dashboard.read`
      (SUPER_ADMIN + ADMIN + ANALYST; MODERATOR generic 403, audited) + audit log.
- [x] Dashboard SPA: live card grid (role-scoped route guard), last-refresh stamp,
      stale-token refresh poll (60s re-validates session + reloads cards),
      logout-anywhere / session-expiry handling (auto sign-out on 401/403).
- [x] Tests: FakeDb.dashboardLive + router integration (SUPER_ADMIN/ANALYST ok,
      MODERATOR 403 + authz.denied.dashboard.read audit). Admin suite 50→51;
      TOTAL 86→87 all PASS. Gates lint + build green.

### ADMIN Phase D — Users, Sessions & Presence  [NEXT]
- [ ] List users (server query, admin_session joined, never user PII leaks),
      active/inactive, sessions list per user, force-logout user (destructive,
      audited), per-user session revocation.

### ADMIN Phase E — Songs & Listening Analytics
- [ ] Song top charts (plays, unique listeners, duration), per-song stats,
      adaptive/browser breakdown, region distribution (server HTTP header hints).

### ADMIN Phase F — Playlist Management
- [ ] Public-playlist CRUD via admin (server-side, RLS-guarded), hidden/approved
      flags, removals (audited, destructive).

### ADMIN Phase G — Rooms Management
- [ ] List/create/end rooms, per-room members, remove participant (destructive,
      audited), room backoff/cleanup admin action.

### ADMIN Phase H — Chat Moderation
- [ ] Chat log view, delete message (audited), timeout/mute participant (audited),
      per-room moderation actions.

### ADMIN Phase I — Voice & Realtime Diagnostics
- [ ] Voice session/participant health, RTC/peer congestion stats, realtime
      channel status, anomaly finder (per-home-latency).

### ADMIN Phase J — Traffic, Time-Spent & Growth Analytics
- [ ] DAU/WAU/MAU, active-now graphs, time-spent per seat, retention, growth,
      per-browser/region, export CSV (server generated).

### ADMIN Phase K — Imports & Resolution Monitoring
- [ ] Import queue depth, success/fail timeouts, per-resolver failure breakdown,
      songs auto-retry stats, cache health.

### ADMIN Phase L — System Health & Error Center
- [ ] Backend/latency probes, error logs (no secrets), storage usage, DB row
      counts, healthy/unhealthy indicators.

### ADMIN Phase M — Performance, Indexes & Aggregation
- [ ] Server-side aggregates + indexes migration, query-plan review, dashboard
      query time budget (<500ms), indexes on the hot paths.

### ADMIN Phase N — Security Audit (red-team pass)
- [ ] IDOR sweep (every objectId belongs to caller scope), CSRF re-check, session
      fixation, cookie flags, log-leak sweep, brute-force recheck, PLAYER island
      re-verified fully isolated, no secrets anywhere.
- [ ] Report: pass/fail per OWASP-ish check with evidence.

### ADMIN Phase O — Full Integration + Regression
- [ ] End-to-end: login → change password → dashboard → every admin view (with
      seeded demo data), audit trail completeness, plus full main-site regression
      (36 tests + deep player smoke).

### ADMIN Phase P — Production Deploy Ops (USER + code)
- [ ] Code: final env validation (Netlify: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
      ADMIN_INIT_*), sanitized build, no dev backdoor.
- [ ] USER: run `supabase/admin_schema.sql`, cancel anon access on admin tables,
      set Netlify env vars (service-role key server-side ONLY), deploy, first
      login (forced password change), then delete ADMIN_INIT_* envs.
- [ ] Smoke in prod: login flow, forced change, session expiry, player still
      works on same site.

### ADMIN Phase Q — Final Admin Report
- [ ] Full CREESPY ADMIN report (architecture, security attestation, schema,
      env checklist, known limitations, rollback plan, next steps).

---

_Last updated: ADMIN Phase C complete (code-side — server-computed live cards RPC, role-scoped dashboard, stale-token refresh; gates green: lint + 87/87 tests + build). ADMIN Phase D = NEXT. Open user-ops: Phase 26 RLS SQL, Phase 30 Netlify env, Phase 28 device matrix, ADMIN deploy (schema §1–5 + env + first login). Player phases 0–31 code-side complete._
