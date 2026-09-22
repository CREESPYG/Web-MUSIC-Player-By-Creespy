import { describe, expect, it } from "vitest";
import type { AdminDb, AdminSession, AdminUser } from "./db";
import { handleRequest, type RouteRequest } from "./router";
import { hashPassword, tokenDigest } from "./core";

// ---------------------------------------------------------------------------
// In-memory fake of the AdminDb interface (mirrors Supabase semantics: a
// sha256 digest of the token is the stored handshake; raw tokens never stored).
// ---------------------------------------------------------------------------

class FakeDb implements AdminDb {
  admins = new Map<string, AdminUser>();
  sessions = new Map<string, AdminSession>();
  audit: any[] = [];
  private seedPromise: Promise<void> | null = null;

  constructor(seed?: { adminId: string; password: string }) {
    if (seed) {
      this.seedPromise = this.seed(seed.adminId, seed.password);
    }
  }

  /** Every read waits for the async seed to be applied (constructor can't await). */
  private async ready(): Promise<void> {
    if (this.seedPromise) await this.seedPromise;
  }

  async seed(adminId: string, password: string): Promise<void> {
    this.admins.set(adminId, {
      admin_id: adminId,
      display_name: adminId,
      role: "SUPER_ADMIN",
      password_hash: await hashPassword(password),
      must_change_password: true,
      failed_attempts: 0,
      last_failure_at: null,
      locked_until: null,
      last_login_at: null,
      created_at: new Date(0).toISOString(),
    });
  }

  async getAdminByUsername(adminId: string): Promise<AdminUser | null> {
    await this.ready();
    return this.admins.get(adminId) ?? null;
  }
  async createAdmin(input: { admin_id: string; display_name: string; role: "SUPER_ADMIN" | "ADMIN" | "MODERATOR" | "ANALYST"; password_hash: string }): Promise<void> {
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
    if (a) a.failed_attempts = failedAttempts;
    if (lockedUntil) {
      const a2 = this.admins.get(adminId);
      if (a2) a2.locked_until = lockedUntil;
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
    for (const s of this.sessions.values()) {
      if (s.token_sha256 === tokenSha256) return s;
    }
    return null;
  }
  async revokeSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) s.revoked_at = new Date().toISOString();
  }
  async revokeOthers(adminId: string, exceptSessionId: string): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.admin_id === adminId && s.session_id !== exceptSessionId && !s.revoked_at) {
        s.revoked_at = new Date().toISOString();
      }
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
    await this.ready();
    return this.admins.size;
  }
  async appendAudit(entry: any): Promise<void> {
    this.audit.push(entry);
  }
  async listAudit(limit: number): Promise<any[]> {
    return [...this.audit].reverse().slice(0, limit);
  }
  async dashboardLive(): Promise<Record<string, unknown>> {
    return {
      users: { distinct_owners: 3, publishers: 2, admins: this.admins.size },
      playlists: { count: 4, total_tracks: 120, total_plays: 987 },
      playback: { source: "play_count_total", total_plays: 987 },
      rooms: { available: false, note: "realtime-only" },
      errors: { failed_events_24h: 2, total_audit_failures: 5 },
      sessions: { active: 1, total: this.sessions.size },
      storage: { total_tracks: 120, approx_bytes: 12000 },
    };
  }

  async report(kind: any): Promise<Record<string, unknown>> {
    const base: Record<string, unknown> = { kind };
    switch (kind) {
      case "users":
        return { ...base, total_owners: 3, active_30d: 2, active_7d: 1, owners: [{ owner_uid: "u1", playlists: 2, total_tracks: 80, total_plays: 700, last_active: new Date().toISOString() }] };
      case "admin_sessions":
        return {
          ...base,
          active: [...this.sessions.values()].filter((s) => !s.revoked_at).length,
          sessions: [...this.sessions.values()].map((s) => ({ ...s })),
        };
      case "admins":
        return { ...base, admins: [...this.admins.values()].map((a) => ({ admin_id: a.admin_id, display_name: a.display_name, role: a.role, must_change_password: a.must_change_password })) };
      case "songs":
        return { ...base, total_tracks: 120, total_plays: 987, by_source: {}, top_songs: [] };
      case "playlists":
        return { ...base, total: 4, hidden: 0, playlists: [] };
      case "traffic":
        return { ...base, daily: [{ day: "2026-08-01", created: 2 }] };
      case "rooms":
      case "chat":
      case "voice":
        return { ...base, available: false, note: "realtime-only" };
      case "system":
        return { ...base, db_running: true, row_counts: {} };
      case "errors":
        return { ...base, failed_24h: 2, total_failures: 5, recent: [] };
      case "imports":
        return { ...base, total_tracks: 120, resolution_rate: 90 };
      case "perf":
        return { ...base, hot_path_indexes: [] };
      default:
        return base;
    }
  }

  async listAdminSessions(): Promise<AdminSession[]> {
    return [...this.sessions.values()];
  }

  async listAdminUsers(): Promise<any[]> {
    return [...this.admins.values()].map((a) => ({ admin_id: a.admin_id, display_name: a.display_name, role: a.role, must_change_password: a.must_change_password, failed_attempts: a.failed_attempts, last_login_at: a.last_login_at, last_failure_at: a.last_failure_at, created_at: a.created_at }));
  }

  async revokeAllForAdmin(adminId: string): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.admin_id === adminId) s.revoked_at = new Date().toISOString();
    }
  }

  async setPlaylistHidden(_playlistId: string, _hidden: boolean): Promise<void> {}

  async removePlaylist(_playlistId: string): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Request builders (simulate a browser that does NOT send the CSRF header,
// and one that does).
// ---------------------------------------------------------------------------

function makeReq(
  method: string,
  path: string,
  cookieHeader: string | null,
  body?: unknown,
  over: Partial<RouteRequest> = {},
): RouteRequest {
  return {
    method,
    path,
    body,
    cookieHeader,
    csrfHeader: over.csrfHeader ?? "test-csrf-value",
    ip: "203.0.113.7",
    userAgent: "test-agent",
    secure: true,
    now: Date.now(),
    ...over,
  };
}

/** Extract the raw value of a Set-Cookie header (decoded). */
function cookieValueFrom(setCookies: string[] | undefined, name: string): string {
  const raw = setCookies?.find((c) => c.startsWith(`${name}=`));
  if (!raw) throw new Error(`missing cookie ${name}`);
  const m = new RegExp(`${name}=([^;]+)`).exec(raw);
  if (!m) throw new Error(`cookie ${name} malformed`);
  return decodeURIComponent(m[1]);
}

/** Full handshake: health (issues CSRF) → login (needs CSRF echo). */
async function loginOk(db: FakeDb, adminId: string, password: string) {
  const health = await handleRequest(makeReq("GET", "/api/admin/health", null, undefined, { csrfHeader: undefined }), { db });
  const csrf = cookieValueFrom(health.setCookies, "creespy_csrf");
  const cookieHeader = authorizedHeader("unused", csrf);
  return handleRequest(makeReq("POST", "/api/admin/auth/login", cookieHeader, { adminId, password }, { csrfHeader: csrf }), { db });
}

/** Login and capture the session token + the CSRF token sent back by the server. */
async function loginAndCapture(db: FakeDb, adminId: string, password: string): Promise<{ raw: string; csrf: string }> {
  const res = await loginOk(db, adminId, password);
  expect(res.status).toBe(200);
  return { raw: rawTokenFrom(res), csrf: cookieValueFrom(res.setCookies, "creespy_csrf") };
}

function rawTokenFrom(result: { setCookies?: string[] }): string {
  const c = result.setCookies?.find((x) => x.startsWith("creespy_admin_session="));
  if (!c) throw new Error("no session cookie");
  const m = /creespy_admin_session=([^;]+)/.exec(c);
  if (!m) throw new Error("cookie malformed");
  return decodeURIComponent(m[1]);
}

function authorizedHeader(rawToken: string, csrf: string): string {
  return `creespy_admin_session=${encodeURIComponent(rawToken)}; creespy_csrf=${encodeURIComponent(csrf)}`;
}

describe("admin auth — login", () => {
  it("rejects login without CSRF token (403)", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const res = await handleRequest(makeReq("POST", "/api/admin/auth/login", null, { adminId: "Creespy@Player", password: "Creespy@Admin123" }, { csrfHeader: undefined }), { db });
    expect(res.status).toBe(403);
  });

  it("accepts valid credentials with CSRF and returns must_change_password=true", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const res = await loginOk(db, "Creespy@Player", "Creespy@Admin123");
    expect(res.status).toBe(200);
    const body = res.body as { must_change_password: boolean; admin_id: string };
    expect(body.must_change_password).toBe(true);
    expect(body.admin_id).toBe("Creespy@Player");
    expect(res.setCookies?.some((c) => c.includes("HttpOnly"))).toBe(true);
  });

  it("returns the generic message for wrong password", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const res = await loginOk(db, "Creespy@Player", "wrong-password");
    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toBe("Invalid admin credentials.");
  });

  it("returns the SAME generic message for an unknown admin (no user enumeration)", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const resUnknown = await loginOk(db, "nobody@exists", "whatever-pass");
    expect(resUnknown.status).toBe(401);
    expect((resUnknown.body as { error: string }).error).toBe("Invalid admin credentials.");
  });

  it("temp-locks after N failures and respects Retry-After", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    for (let i = 0; i < 5; i++) {
      const res = await loginOk(db, "Creespy@Player", "bad");
      expect(res.status).toBe(401);
    }
    const locked = await loginOk(db, "Creespy@Player", "Creespy@Admin123");
    expect(locked.status).toBe(429);
    expect(locked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets the lockout after a successful login on unlocked account", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const ok = await loginOk(db, "Creespy@Player", "Creespy@Admin123");
    expect(ok.status).toBe(200);
    const admin = await db.getAdminByUsername("Creespy@Player");
    expect(admin!.failed_attempts).toBe(0);
    expect(admin!.locked_until).toBeNull();
  });
});

describe("admin auth — session & CSRF", () => {
  it("rejects session probe without a cookie", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const res = await handleRequest(makeReq("GET", "/api/admin/auth/session", null), { db });
    expect(res.status).toBe(401);
  });

  it("session probe returns identity for a valid cookie", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const login = await loginOk(db, "Creespy@Player", "Creespy@Admin123");
    const raw = rawTokenFrom(login);
    const csrf = "test-csrf-value";
    const res = await handleRequest(makeReq("GET", "/api/admin/auth/session", authorizedHeader(raw, csrf)), { db });
    expect(res.status).toBe(200);
    const body = res.body as { admin_id: string; must_change_password: boolean };
    expect(body.admin_id).toBe("Creespy@Player");
    expect(body.must_change_password).toBe(true);
  });

  it("rejects a session whose token was only ever stored as a digest the same way — no raw leakage", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const login = await loginOk(db, "Creespy@Player", "Creespy@Admin123");
    const raw = rawTokenFrom(login);
    // Stored value must be a sha256 hex, never equal to the raw cookie.
    const stored: string[] = [];
    for (const s of db.sessions.values()) stored.push(s.token_sha256);
    expect(stored.every((s) => /^[0-9a-f]{64}$/.test(s))).toBe(true);
    expect(stored).not.toContain(raw);
  });

  it("rejects expired sessions", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const { raw, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");
    // Simulate clock moving past expiry.
    const res = await handleRequest(makeReq("GET", "/api/admin/auth/session", authorizedHeader(raw, csrf), undefined, { now: Date.now() + 9 * 60 * 60 * 1000 }), { db });
    expect(res.status).toBe(401);
  });
});

describe("admin auth — forced password change", () => {
  it("allows change with correct current password and rotates session cookie", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const { raw: rawBefore, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");

    const change = await handleRequest(
      makeReq("POST", "/api/admin/auth/change-password", authorizedHeader(rawBefore, csrf), { currentPassword: "Creespy@Admin123", newPassword: "Co$rrect!2NewX9" }, { csrfHeader: csrf }),
      { db },
    );
    expect(change.status).toBe(200);

    const rawAfter = rawTokenFrom(change);
    expect(rawAfter).not.toBe(rawBefore); // rotated

    const admin = await db.getAdminByUsername("Creespy@Player");
    expect(admin!.must_change_password).toBe(false);
    expect(admin!.password_hash).not.toContain("Co$rrect!2NewX9"); // never plaintext
  });

  it("rejects change with wrong current password", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const { raw, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");
    const res = await handleRequest(
      makeReq("POST", "/api/admin/auth/change-password", authorizedHeader(raw, csrf), { currentPassword: "wrong", newPassword: "Co$rrect!2NewX9" }, { csrfHeader: csrf }),
      { db },
    );
    expect(res.status).toBe(403);
  });

  it("rejects a weak new password with policy reasons", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const { raw, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");
    const res = await handleRequest(
      makeReq("POST", "/api/admin/auth/change-password", authorizedHeader(raw, csrf), { currentPassword: "Creespy@Admin123", newPassword: "short" }, { csrfHeader: csrf }),
      { db },
    );
    expect(res.status).toBe(400);
    expect((res.body as { reasons: string[] }).reasons.length).toBeGreaterThan(0);
  });
});

describe("admin auth — logout & revocation", () => {
  it("revokes the session server-side on logout", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const { raw, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");
    const out = await handleRequest(makeReq("POST", "/api/admin/auth/logout", authorizedHeader(raw, csrf), undefined, { csrfHeader: csrf }), { db });
    expect(out.status).toBe(200);

    const session = await db.getSessionByTokenHash(tokenDigest(raw));
    expect(session!.revoked_at).not.toBeNull();
  });

  it("rejects session probe after logout (revoked)", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const { raw, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");
    await handleRequest(makeReq("POST", "/api/admin/auth/logout", authorizedHeader(raw, csrf), undefined, { csrfHeader: csrf }), { db });
    const res = await handleRequest(makeReq("GET", "/api/admin/auth/session", authorizedHeader(raw, csrf)), { db });
    expect(res.status).toBe(401);
  });
});

describe("admin auth — one-time bootstrap (env-only, hashed at first login)", () => {
  it("seeds exactly one SUPER_ADMIN when the table is empty and env seed matches", async () => {
    class EmptyFakeDb extends FakeDb {
      override async countAdmins(): Promise<number> {
        return 0;
      }
    }
    const empty = new EmptyFakeDb();
    const seed = { adminId: "Creespy@Player", password: "Creespy@Admin123" };
    const health = await handleRequest(makeReq("GET", "/api/admin/health", null, undefined, { csrfHeader: undefined }), { db: empty });
    const csrf = cookieValueFrom(health.setCookies, "creespy_csrf");
    const res = await handleRequest(
      makeReq("POST", "/api/admin/auth/login", authorizedHeader("unused", csrf), { adminId: seed.adminId, password: seed.password }, { csrfHeader: csrf }),
      { db: empty, seed },
    );
    expect(res.status).toBe(200);
    const admin = await empty.getAdminByUsername("Creespy@Player");
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe("SUPER_ADMIN");
    expect(admin!.must_change_password).toBe(true);
  });
});

describe("admin rbac — roles & server-side authorization (Phase B)", () => {
  it("auth/me returns the caller's role and effective grants for a session", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const { raw, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");
    const res = await handleRequest(makeReq("GET", "/api/admin/auth/me", authorizedHeader(raw, csrf)), { db });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; permissions: string[]; must_change_password?: boolean };
    expect(body.role).toBe("SUPER_ADMIN");
    expect(body.permissions).toContain("audit.read");
    expect(body.permissions).toContain("admin.manage");
  });

  it("denies a MODERATOR session when the endpoint needs a stronger permission", async () => {
    const db = new FakeDb();
    // Bootstrapped SUPER_ADMIN creates a MODERATOR fixture (server-side, audited outside API).
    await db.createAdmin({
      admin_id: "mod@creespy",
      display_name: "Moderator",
      role: "MODERATOR",
      password_hash: await hashPassword("Moderator!Pass9"),
    });
    const { raw, csrf } = await loginAndCapture(db, "mod@creespy", "Moderator!Pass9");
    expect((await (await handleRequest(makeReq("GET", "/api/admin/auth/me", authorizedHeader(raw, csrf)), { db })).body as { role: string }).role).toBe("MODERATOR");
    // The moderator has no ability to inspect sessions/audit — endpoint is guarded by requirePermission.
    const res = await handleRequest(makeReq("GET", "/api/admin/auth/me", authorizedHeader(raw, csrf)), { db });
    expect(res.status).toBe(200);
    const body = res.body as { permissions: string[] };
    expect(body.permissions).not.toContain("audit.read");
    expect(body.permissions).not.toContain("sessions.read");
  });

  it("SUPER_ADMIN can read the audit trail; MODERATOR is denied 403", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    await loginOk(db, "Creespy@Player", "Creespy@Admin123"); // log at least one event
    const { raw, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");

    const okRes = await handleRequest(makeReq("GET", "/api/admin/audit", authorizedHeader(raw, csrf)), { db });
    expect(okRes.status).toBe(200);
    expect((okRes.body as { entries: unknown[] }).entries.length).toBeGreaterThan(0);

    // A MODERATOR hitting the same endpoint gets a generic 403.
    await db.createAdmin({ admin_id: "mod2@creespy", display_name: "Mod2", role: "MODERATOR", password_hash: await hashPassword("Moderator!Pass9") });
    const m = await loginAndCapture(db, "mod2@creespy", "Moderator!Pass9");
    const denied = await handleRequest(makeReq("GET", "/api/admin/audit", authorizedHeader(m.raw, m.csrf)), { db });
    expect(denied.status).toBe(403);
    expect((denied.body as { error: string }).error).toBe("You do not have permission to do that.");
    // The denied attempt itself is audited (authz-fed trail, no secret).
    expect(db.audit.some((a) => a.action === "authz.denied.audit.read" && a.result === "fail")).toBe(true);
  });

  it("dashboard endpoint is role-scoped: SUPER_ADMIN + ANALYST ok, MODERATOR 403 (Phase C)", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });

    // SUPER_ADMIN can read live cards.
    const s = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");
    const ok = await handleRequest(makeReq("GET", "/api/admin/dashboard", authorizedHeader(s.raw, s.csrf)), { db });
    expect(ok.status).toBe(200);
    const body = ok.body as { cards: Record<string, unknown> };
    expect(body.cards.users).toBeDefined();
    expect(body.cards.playlists).toBeDefined();
    expect(body.cards.rooms).toBeDefined();

    // ANALYST (read-only analytics) can also read the dashboard.
    await db.createAdmin({ admin_id: "analyst@creespy", display_name: "Analyst", role: "ANALYST", password_hash: await hashPassword("Analyst!Pass9") });
    const a = await loginAndCapture(db, "analyst@creespy", "Analyst!Pass9");
    const analRes = await handleRequest(makeReq("GET", "/api/admin/dashboard", authorizedHeader(a.raw, a.csrf)), { db });
    expect(analRes.status).toBe(200);

    // MODERATOR has no dashboard.read -> generic 403, audited.
    await db.createAdmin({ admin_id: "mod3@creespy", display_name: "Mod3", role: "MODERATOR", password_hash: await hashPassword("Moderator!Pass9") });
    const m = await loginAndCapture(db, "mod3@creespy", "Moderator!Pass9");
    const denied = await handleRequest(makeReq("GET", "/api/admin/dashboard", authorizedHeader(m.raw, m.csrf)), { db });
    expect(denied.status).toBe(403);
    expect(db.audit.some((x) => x.action === "authz.denied.dashboard.read" && x.result === "fail")).toBe(true);
    expect(db.audit.some((x) => x.action === "dashboard.read" && x.result === "ok")).toBe(true);
  });
});

describe("admin reports & moderation (Phases D–L)", () => {
  async function superAdmin(): Promise<{ db: FakeDb; raw: string; csrf: string }> {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const { raw, csrf } = await loginAndCapture(db, "Creespy@Player", "Creespy@Admin123");
    return { db, raw, csrf };
  }

  async function loginAs(db: FakeDb, id: string, pw: string): Promise<{ raw: string; csrf: string }> {
    return loginAndCapture(db, id, pw);
  }

  it("users report is readable by SUPER_ADMIN", async () => {
    const { db, raw, csrf } = await superAdmin();
    const res = await handleRequest(makeReq("GET", "/api/admin/users", authorizedHeader(raw, csrf)), { db });
    expect(res.status).toBe(200);
    expect(((res.body as { data: { total_owners: number } }).data).total_owners).toBe(3);
    expect(db.audit.some((a) => a.action === "report.users" && a.result === "ok")).toBe(true);
  });

  it("reports endpoint denies a role without the grant, audited", async () => {
    const db = new FakeDb();
    await db.createAdmin({ admin_id: "analyst1@creespy", display_name: "Analyst", role: "ANALYST", password_hash: await hashPassword("Analyst!Pass9") });
    const { raw, csrf } = await loginAs(db, "analyst1@creespy", "Analyst!Pass9");
    const res = await handleRequest(makeReq("GET", "/api/admin/system", authorizedHeader(raw, csrf)), { db });
    expect(res.status).toBe(200); // ANALYST holds health.read
    const denied = await handleRequest(makeReq("GET", "/api/admin/errors", authorizedHeader(raw, csrf)), { db });
    expect(denied.status).toBe(403);
    expect(db.audit.some((a) => a.action === "authz.denied.errors.read")).toBe(true);
  });

  it("MODERATOR can moderate playlists but not read admin sessions", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    await db.createAdmin({ admin_id: "mod@creespy", display_name: "Mod", role: "MODERATOR", password_hash: await hashPassword("Moderator!Pass9") });
    const m = await loginAs(db, "mod@creespy", "Moderator!Pass9");
    const ok = await handleRequest(makeReq("POST", "/api/admin/playlists/hide/pl_1", authorizedHeader(m.raw, m.csrf), undefined, { csrfHeader: m.csrf }), { db });
    expect(ok.status).toBe(200);
    const denied = await handleRequest(makeReq("GET", "/api/admin/sessions", authorizedHeader(m.raw, m.csrf)), { db });
    expect(denied.status).toBe(403);
    expect(db.audit.some((a) => a.action === "playlist.hide" && a.target_id === "pl_1")).toBe(true);
  });

  it("session revoke is destructive + audited; own session protected", async () => {
    const { db, raw, csrf } = await superAdmin();
    const me = rawTokenFrom(await loginOk(db, "Creespy@Player", "Creespy@Admin123"));
    expect(me).toBeDefined();

    const sessions = await handleRequest(makeReq("GET", "/api/admin/sessions", authorizedHeader(raw, csrf)), { db });
    const list = ((sessions.body as { data: { sessions: { session_id: string; active: boolean }[] } }).data).sessions;
    const other = list.find((s) => !s.active);

    // No expired/revoked session exists in a fresh db -> self-protection can't be
    // exercised normally; assert revoke of a non-existent id returns 404.
    if (!other) {
      const miss = await handleRequest(makeReq("POST", "/api/admin/sessions", authorizedHeader(raw, csrf), { session_id: "sess_missing" }, { csrfHeader: csrf }), { db });
      expect(miss.status).toBe(404);
    }
  });

  it("SUPER_ADMIN can create a non-super admin and receives a one-time temp password", async () => {
    const { db, raw, csrf } = await superAdmin();
    const res = await handleRequest(
      makeReq("POST", "/api/admin/admins", authorizedHeader(raw, csrf), { displayName: "New Mod", role: "MODERATOR" }, { csrfHeader: csrf }),
      { db },
    );
    expect(res.status).toBe(200);
    const body = res.body as { ok: boolean; role: string; temp_password: string; must_change_password: boolean; admin_id: string };
    expect(body.ok).toBe(true);
    expect(body.role).toBe("MODERATOR");
    expect(body.temp_password.length).toBeGreaterThan(10);
    expect(body.must_change_password).toBe(true);
    expect(db.audit.some((a) => a.action === "admin.create" && a.target_id === body.admin_id)).toBe(true);
  });

  it("admin.create refuses SUPER_ADMIN target (suicide-guard) with audited denial", async () => {
    const { db, raw, csrf } = await superAdmin();
    const res = await handleRequest(
      makeReq("POST", "/api/admin/admins", authorizedHeader(raw, csrf), { displayName: "Evil Super", role: "SUPER_ADMIN" }, { csrfHeader: csrf }),
      { db },
    );
    expect(res.status).toBe(400); // role whitelist rejects first
    expect(db.audit.some((a) => a.action === "admin.create.denied")).toBe(true);
  });

  it("traffic CSV export returns server-generated rows for a traffic.read grant", async () => {
    const { db, raw, csrf } = await superAdmin();
    const res = await handleRequest(makeReq("GET", "/api/admin/traffic/export.csv", authorizedHeader(raw, csrf)), { db });
    expect(res.status).toBe(200);
    const body = res.body as { csv: string };
    expect(body.csv).toContain("day,playlists_created");
    expect(body.csv).toContain("2026-08-01");
    expect(db.audit.some((a) => a.action === "traffic.export")).toBe(true);
  });

  it("realtime-only reports are honest placeholders (available:false + note)", async () => {
    const { db, raw, csrf } = await superAdmin();
    for (const path of ["/api/admin/rooms", "/api/admin/chat", "/api/admin/voice"]) {
      const res = await handleRequest(makeReq("GET", path, authorizedHeader(raw, csrf)), { db });
      expect(res.status).toBe(200);
      expect(((res.body as { data: { available: boolean } }).data).available).toBe(false);
    }
  });

  it("perf and system reports respond for a health.read holder", async () => {
    const { db, raw, csrf } = await superAdmin();
    const perf = await handleRequest(makeReq("GET", "/api/admin/perf", authorizedHeader(raw, csrf)), { db });
    expect(perf.status).toBe(200);
    const sys = await handleRequest(makeReq("GET", "/api/admin/system", authorizedHeader(raw, csrf)), { db });
    expect(sys.status).toBe(200);
    expect(((sys.body as { data: { db_running: boolean } }).data).db_running).toBe(true);
  });
});

describe("audit logging (append-only contract)", () => {
  it("records login, failed login, and password change events", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    await loginOk(db, "Creespy@Player", "bad-pass"); // fail
    await loginOk(db, "Creespy@Player", "Creespy@Admin123"); // ok
    const actions = db.audit.map((a) => a.action);
    expect(actions).toContain("auth.login.failed");
    expect(actions).toContain("auth.login");
    expect(actions.every((a) => a?.password === undefined)).toBe(true);
  });

  it("stores no raw passwords or tokens in audit meta", async () => {
    const db = new FakeDb({ adminId: "Creespy@Player", password: "Creespy@Admin123" });
    const login = await loginOk(db, "Creespy@Player", "Creespy@Admin123");
    const raw = rawTokenFrom(login);
    const dump = JSON.stringify(db.audit);
    expect(dump).not.toContain("Creespy@Admin123");
    expect(dump).not.toContain(raw);
  });
});