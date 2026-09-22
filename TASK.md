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

### Phase 17 — Voice Debugging System
- [x] Dev-only DebugPanel (bottom-left): room status/conn, user/session id,
      room code, host, presence count, heartbeat age, reconnect attempts,
      all 4 Supabase channel states (room/chat/sync/lobby), voice status +
      channel state, voice users, mic active + selected input, speech
      perms/mute, online & tab visibility, per-peer conn/ICE/signaling/reconnect
- [x] Polls via 1s interval, `role="log"`, monospace, pointer-events-none
- [x] Read-only telemetry getters (useRoom.debugGet / useVoice.debugGet /
      WebRtcVoiceManager.debugSnapshot) — never drive behavior; no secrets
- [x] Gate: hidden in production build (`import.meta.env.DEV`); explicit
      non-UI localStorage opt-in `creespy.debugPanel=1` for staging tests

### Phase 26 — Security Audit
- [ ] Supabase RLS / realtime authorization verified server-side (needs project access)
- [ ] No service-role/TURN secrets in client (publishable key only)
- [ ] Gate: unauthorized actions rejected server-side

### Phase 27 — Complete Integration Test
- [ ] Full chain manually: import → 1000+ → play → queue → room → chat →
      voice → per-user volume → host tab switch → room stays → voice reconnect →
      mobile join
- [ ] Gate: every major subsystem works together

### Phase 28 — Full Browser Testing
- [ ] Chrome/Edge/Firefox/Brave desktop; Android Chrome; iOS Safari
- [ ] Desktop↔Desktop, Desktop↔Mobile; same/different network, hotspot
- [ ] Tab switch, refresh, network loss/reconnect, minimize/background
- [ ] Breakpoints: 320/360/375/390/414/430/768

### Phase 29 — Final Regression
- [ ] 33-item checklist (search, playlists, all adapters, rooms, voice,
      visualizer, customization, desktop, mobile, a11y, perf, security)
- [ ] Includes: accessibility focus/contrast/screen-reader pass

### Phase 30 — Final Build / Deployment Validation
- [ ] Add lint script (missing today) or document "typecheck as lint"
- [ ] Clean production build; env vars (TURN) set on Netlify
- [ ] Supabase prod config + RLS + no secrets exposed
- [ ] No dev debug UI exposed; no console errors; smoke tests

### Phase 31 — Final Report
- [ ] 32-section report (audit → root causes → architecture → DB → each
      subsystem → limitations → SFU recommendation)

---

_Last updated: after Phase 24 (seamless post-refresh resume) — gates green._
