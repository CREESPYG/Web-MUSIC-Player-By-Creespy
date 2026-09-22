// ---------------------------------------------------------------------------
// CREESPY Admin — in-memory AdminDb for LOCAL DEV only.
//
// Lets the admin control plane run under `vite` with NO Supabase project,
// schema or env. Production uses SupabaseAdminDb (netlify/functions) — this
// double exists purely so developers can exercise login/session/dashboard
// locally. It mirrors the same invariants (sha256 of token stored only,
// scrypt-hashed passwords) so behavior is faithful.
// ---------------------------------------------------------------------------

import type { AdminDb, AdminReportKind, AdminSession, AdminUser, AdminUserSafe, AuditEntry } from "./db";
import { hashPassword } from "./core";

const DEV_INIT_ID = "Creespy@Player";
const DEV_INIT_PASSWORD = "Creespy@Admin123";

export class MemoryAdminDb implements AdminDb {
  admins = new Map<string, AdminUser>();
  sessions = new Map<string, AdminSession>();
  audit: AuditEntry[] = [];

  constructor(seed?: { adminId: string; password: string; displayName?: string }) {
    if (!seed) seed = { adminId: DEV_INIT_ID, password: DEV_INIT_PASSWORD };
    void this.seed(seed);
  }

  private async seed(seed: { adminId: string; password: string; displayName?: string }): Promise<void> {
    this.admins.set(seed.adminId, {
      admin_id: seed.adminId,
      display_name: seed.displayName ?? "CREESPY Admin",
      role: "SUPER_ADMIN",
      password_hash: await hashPassword(seed.password),
      must_change_password: true,
      failed_attempts: 0,
      last_failure_at: null,
      locked_until: null,
      last_login_at: null,
      created_at: new Date().toISOString(),
    });
  }

  async getAdminByUsername(adminId: string): Promise<AdminUser | null> {
    return this.admins.get(adminId) ?? null;
  }
  async createAdmin(input: { admin_id: string; display_name: string; role: AdminUser["role"]; password_hash: string }): Promise<void> {
    this.admins.set(input.admin_id, {
      admin_id: input.admin_id,
      display_name: input.display_name,
      role: input.role,
      password_hash: input.password_hash,
      must_change_password: true,
      failed_attempts: 0,
      last_failure_at: null,
      locked_until: null,
      last_login_at: null,
      created_at: new Date().toISOString(),
    });
  }
  async updateFailedAttempts(adminId: string, failedAttempts: number, lockedUntil: string | null): Promise<void> {
    const a = this.admins.get(adminId);
    if (a) {
      a.failed_attempts = failedAttempts;
      a.last_failure_at = new Date().toISOString();
      a.locked_until = lockedUntil;
    }
  }
  async resetFailedAttempts(adminId: string): Promise<void> {
    const a = this.admins.get(adminId);
    if (a) {
      a.failed_attempts = 0;
      a.locked_until = null;
    }
  }
  async updateLastLogin(adminId: string, at: string): Promise<void> {
    const a = this.admins.get(adminId);
    if (a) a.last_login_at = at;
  }
  async updatePassword(adminId: string, passwordHash: string): Promise<void> {
    const a = this.admins.get(adminId);
    if (a) a.password_hash = passwordHash;
  }
  async clearMustChange(adminId: string): Promise<void> {
    const a = this.admins.get(adminId);
    if (a) a.must_change_password = false;
  }
  async createSession(input: { admin_id: string; token_sha256: string; ip_address: string | null; user_agent: string | null; expires_at: string }): Promise<string> {
    const id = `sess_${this.sessions.size + 1}`;
    this.sessions.set(id, {
      session_id: id,
      admin_id: input.admin_id,
      token_sha256: input.token_sha256,
      ip_address: input.ip_address,
      user_agent: input.user_agent,
      created_at: new Date().toISOString(),
      expires_at: input.expires_at,
      revoked_at: null,
    });
    return id;
  }
  async getSessionByTokenHash(tokenSha256: string): Promise<AdminSession | null> {
    for (const s of this.sessions.values()) if (s.token_sha256 === tokenSha256) return s;
    return null;
  }
  async revokeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) s.revoked_at = new Date().toISOString();
  }
  async revokeOthers(adminId: string, exceptSessionId: string): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.admin_id === adminId && s.session_id !== exceptSessionId && !s.revoked_at) s.revoked_at = new Date().toISOString();
    }
  }
  async replaceSession(sessionId: string, newTokenSha256: string, newExpiresAt: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.token_sha256 = newTokenSha256;
      s.expires_at = newExpiresAt;
    }
  }
  async countAdmins(): Promise<number> {
    return this.admins.size;
  }
  async appendAudit(entry: AuditEntry): Promise<void> {
    this.audit.push(entry);
  }
  async listAudit(limit: number): Promise<AuditEntry[]> {
    return [...this.audit].reverse().slice(0, limit);
  }
  async dashboardLive(): Promise<Record<string, unknown>> {
    return {
      users: { distinct_owners: 12, publishers: 7, admins: this.admins.size },
      playlists: { count: 23, total_tracks: 640, total_plays: 4821 },
      playback: { source: "play_count_total", total_plays: 4821 },
      rooms: { available: false, note: "Rooms are realtime-only (no persisted table yet); lands in Phase G." },
      errors: { failed_events_24h: 0, total_audit_failures: 0 },
      sessions: { active: [...this.sessions.values()].filter((s) => !s.revoked_at && Date.parse(s.expires_at) > Date.now()).length, total: this.sessions.size },
      storage: { total_tracks: 640, approx_bytes: 640 * 12000 },
    };
  }

  async report(kind: AdminReportKind): Promise<Record<string, unknown>> {
    switch (kind) {
      case "users":
        return {
          total_owners: 12,
          active_30d: 9,
          active_7d: 4,
          owners: [
            { owner_uid: "user_a", playlists: 5, total_tracks: 210, total_plays: 1830, last_active: new Date().toISOString(), first_published: new Date(Date.now() - 40e6).toISOString() },
            { owner_uid: "user_b", playlists: 3, total_tracks: 96, total_plays: 640, last_active: new Date(Date.now() - 2 * 864e5).toISOString(), first_published: new Date(Date.now() - 90e6).toISOString() },
            { owner_uid: "user_c", playlists: 2, total_tracks: 40, total_plays: 210, last_active: new Date(Date.now() - 4e6).toISOString(), first_published: new Date(Date.now() - 120e6).toISOString() },
          ],
          note: "Owners are browser-level anonymous ids (no email/phone stored).",
        };
      case "admin_sessions":
        return {
          active: [...this.sessions.values()].filter((s) => !s.revoked_at && Date.parse(s.expires_at) > Date.now()).length,
          expired: [...this.sessions.values()].filter((s) => !s.revoked_at && Date.parse(s.expires_at) <= Date.now()).length,
          revoked: [...this.sessions.values()].filter((s) => s.revoked_at).length,
          sessions: [...this.sessions.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((s) => ({
            session_id: s.session_id,
            admin_id: s.admin_id,
            ip_address: s.ip_address,
            user_agent: s.user_agent,
            created_at: s.created_at,
            expires_at: s.expires_at,
            revoked_at: s.revoked_at,
            active: !s.revoked_at && Date.parse(s.expires_at) > Date.now(),
          })),
        };
      case "admins":
        return {
          admins: [...this.admins.values()].map((a) => adminSafe(a)),
        };
      case "songs":
        return {
          total_tracks: 640,
          total_plays: 4821,
          by_source: { YouTube: 520, JioSaavn: 90, Spotify: 20, SoundCloud: 10 },
          by_resolver: { EXACT: 550, HIGH: 40, MEDIUM: 30, UNRESOLVED: 20 },
          top_songs: [
            { title: "Example Song One", artist: "Artist A", playlists_including: 4, attributed_plays: 214, duration: 214 },
            { title: "Example Song Two", artist: "Artist B", playlists_including: 3, attributed_plays: 180, duration: 190 },
          ],
          note: "Per-song play/region/browser events are not persisted by the player; charts are computed from playlist inclusion + total plays.",
        };
      case "playlists":
        return {
          total: 23,
          hidden: 1,
          playlists: [
            { id: "pl_1", title: "Morning Mix", author: "user_a", owner_uid: "user_a", track_count: 40, play_count: 1001, hidden: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { id: "pl_2", title: "Chill Vibes", author: "user_b", owner_uid: "user_b", track_count: 32, play_count: 640, hidden: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            { id: "pl_3", title: "Hidden One", author: "user_c", owner_uid: "user_c", track_count: 18, play_count: 40, hidden: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          ],
        };
      case "rooms":
        return { available: false, note: "Rooms are realtime-only (Supabase presence/broadcast); no persisted room table exists, so historical/joined lists are not available to the control plane." };
      case "chat":
        return { available: false, note: "Chat messages are realtime broadcast only — never persisted, so there is no moderation backlog to read or delete." };
      case "voice":
        return { available: false, note: "Voice/WebRTC state is transient (in-memory peer maps + realtime signaling); no persisted telemetry exists for the control plane." };
      case "traffic":
        return {
          playlists_created_7d: 5,
          playlists_created_30d: 23,
          active_owners_7d: 4,
          active_owners_30d: 9,
          total_plays: 4821,
          avg_plays_per_playlist: 209.6,
          daily: [
            { day: "2026-08-01", created: 2 },
            { day: "2026-08-02", created: 1 },
            { day: "2026-08-03", created: 3 },
          ],
          note: "No persisted visit/auth stream exists; DAU/WAU/MAU, retention and time-spent cannot be measured honestly. Growth metrics above are playlist-author activity.",
        };
      case "imports":
        return {
          total_tracks: 640,
          resolution_rate: 96.9,
          per_platform: { YouTube: 520, JioSaavn: 90, Spotify: 20, SoundCloud: 10 },
          by_resolver: { EXACT: 550, HIGH: 40, MEDIUM: 30, UNRESOLVED: 20 },
          unresolved_sample: [
            { title: "Unresolved One", artist: "Artist X", platform: "YouTube" },
            { title: "Unresolved Two", artist: "Artist Y", platform: "JioSaavn" },
          ],
        };
      case "system":
        return {
          latency_ms: 2.1,
          row_counts: { public_playlists: 23, admin_users: this.admins.size, admin_sessions: this.sessions.size, admin_audit: this.audit.length },
          db_running: true,
          storage_approx_bytes: 640 * 12000,
          checks: [
            { name: "main.playlists.readable", ok: true },
            { name: "admin.audit.appendable", ok: true },
          ],
        };
      case "errors":
        return {
          failed_24h: this.audit.filter((a) => a.result === "fail" && Date.now() - Date.parse(a.created_at ?? new Date().toISOString()) < 864e5).length,
          total_failures: this.audit.filter((a) => a.result === "fail").length,
          recent: this.audit.filter((a) => a.result === "fail").map((a) => ({ created_at: a.created_at ?? new Date().toISOString(), admin_id: a.admin_id, action: a.action, reason: a.reason, ip_address: a.ip_address, result: a.result })).slice(-50),
          note: "Error center reads server-side audit failures only; no secrets are stored there.",
        };
      case "perf":
        return {
          hot_path_indexes: [
            { path: "public_playlists.updated_at", present: true },
            { path: "public_playlists.owner_uid", present: true },
            { path: "public_playlists.created_at", present: true },
            { path: "admin_sessions.expires_at", present: true },
          ],
          dashboard_query_budget_ms: 500,
        };
    }
  }

  async listAdminSessions(): Promise<AdminSession[]> {
    return [...this.sessions.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  async listAdminUsers(): Promise<AdminUserSafe[]> {
    return [...this.admins.values()].map((a) => adminSafe(a));
  }

  async revokeAllForAdmin(adminId: string): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.admin_id === adminId && !s.revoked_at) s.revoked_at = new Date().toISOString();
    }
  }

  async setPlaylistHidden(_playlistId: string, _hidden: boolean): Promise<void> {
    return;
  }

  async removePlaylist(_playlistId: string): Promise<void> {
    return;
  }
}

function adminSafe(a: AdminUser): AdminUserSafe {
  return {
    admin_id: a.admin_id,
    display_name: a.display_name,
    role: a.role,
    must_change_password: a.must_change_password,
    failed_attempts: a.failed_attempts,
    last_login_at: a.last_login_at,
    last_failure_at: a.last_failure_at,
    created_at: a.created_at,
  };
}

/** Dev bootstrap from env (matching Supabase seed) with safe defaults. */
export function devSeed(): { adminId: string; password: string; displayName?: string } {
  return {
    adminId: process.env.ADMIN_INIT_ID || DEV_INIT_ID,
    password: process.env.ADMIN_INIT_PASSWORD || DEV_INIT_PASSWORD,
    displayName: process.env.ADMIN_INIT_DISPLAY_NAME,
  };
}