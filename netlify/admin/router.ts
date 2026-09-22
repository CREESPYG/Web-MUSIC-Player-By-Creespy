import type { AdminDb, AdminSession, AdminUser } from "./db";
import { toEpochMs } from "./db";
import {
  GENERIC_AUTH_DENIAL,
  SESSION_TTL_MS,
  CSRF_COOKIE,
  allCookies,
  buildCookie,
  checkPasswordPolicy,
  csrfOk,
  generateCsrfToken,
  generateToken,
  hashPassword,
  nextFailedState,
  shouldAllowProbe,
  tokenDigest,
  verifyPassword,
} from "./core";
import { authorize, canManageTarget, effectiveGrants, type AdminAction, type AdminRole } from "./rbac";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteRequest {
  method: string;
  path: string;
  body: unknown;
  cookieHeader: string | null;
  csrfHeader: string | null;
  ip: string | null;
  userAgent: string | null;
  secure: boolean; // https
  now: number;
}

export interface RouteResult {
  status: number;
  body: unknown;
  setCookies?: string[];
  clearCookies?: string[];
  retryAfterMs?: number;
}

export interface RouterDeps {
  db: AdminDb;
  seed?: { adminId: string; password: string; displayName?: string };
}

const SESSION_COOKIE = "creespy_admin_session";
const COOKIE_PATH = "/api/admin";
const CSRF_COOKIE_PATH = "/"; // readable from the /creespy/admin SPA so it can echo it back

// Timing equalizer: an identical-structure scrypt work factor is applied even
// when the admin_id is unknown, so response time cannot reveal user existence.
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("__creespy::timing-equalizer__").catch((err) => {
      dummyHashPromise = null;
      throw err;
    });
  }
  return dummyHashPromise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(status: number, body: unknown, extra: Partial<RouteResult> = {}): RouteResult {
  return { status, body, ...extra };
}

function denied(extra: Partial<RouteResult> = {}): RouteResult {
  return json(401, { error: GENERIC_AUTH_DENIAL }, extra);
}

function csrfTokenFor(): { cookie: string } {
  return { cookie: generateCsrfToken() };
}

function secure(req: RouteRequest): boolean {
  return req.secure;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleRequest(req: RouteRequest, deps: RouterDeps): Promise<RouteResult> {
  const { method, path } = req;
  const cookies = allCookies(req.cookieHeader);

  try {
    // Health check (also refreshes CSRF cookie for the SPA boot).
    if (method === "GET" && (path === "/api/admin/health" || path === "/api/admin/health/")) {
const csrf = csrfTokenFor();
      return json(200, { status: "ok" }, {
        setCookies: [buildCookie(CSRF_COOKIE, csrf.cookie, { httpOnly: false, secure: secure(req), sameSite: "Strict", path: CSRF_COOKIE_PATH })],
      });
    }

    // Auth routes.
    if (path.startsWith("/api/admin/auth")) {
      if (method === "POST" && /\/auth\/login$/.test(path)) return login(req, deps, cookies);
      if (method === "POST" && /\/auth\/change-password$/.test(path)) return changePassword(req, deps, cookies);
      if (method === "POST" && /\/auth\/logout$/.test(path)) return logout(req, deps, cookies);
      if (method === "GET" && /\/auth\/session$/.test(path)) return sessionInfo(req, deps, cookies);
      if (method === "GET" && /\/auth\/me$/.test(path)) return me(req, deps, cookies);
      return json(404, { error: "Not found." });
    }

    // Phase D: users, sessions, admins.
    if (path === "/api/admin/users" || path === "/api/admin/users/") {
      return reports.gate(req, deps, cookies, "users.list", "users");
    }

    if (path === "/api/admin/sessions" || path === "/api/admin/sessions/") {
      if (method === "GET") return reports.gate(req, deps, cookies, "sessions.read", "admin_sessions");
      if (method === "POST") return sessionRevoke(req, deps, cookies);
      return json(405, { error: "Method not allowed." });
    }

    if (path === "/api/admin/admins") {
      if (method === "GET") return reports.gate(req, deps, cookies, "admin.manage", "admins");
      if (method === "POST") return adminCreate(req, deps, cookies);
      return json(405, { error: "Method not allowed." });
    }

    // Phase E: songs & listening analytics.
    if (path === "/api/admin/songs" || path === "/api/admin/songs/") {
      return reports.gate(req, deps, cookies, "songs.read", "songs");
    }

    // Phase F: playlist management (list + hide/unhide/remove mutations).
    if (path === "/api/admin/playlists" || path === "/api/admin/playlists/") {
      return reports.gate(req, deps, cookies, "playlists.moderate", "playlists");
    }
    const playlistAction = /^\/api\/admin\/playlists\/hide\/(.+)$|^\/api\/admin\/playlists\/unhide\/(.+)$|^\/api\/admin\/playlists\/remove\/(.+)$/.exec(path);
    if (playlistAction && method === "POST") {
      const id = playlistAction[1] ?? playlistAction[2] ?? playlistAction[3];
      const action = playlistAction[1] ? "hide" : playlistAction[2] ? "unhide" : "remove";
      return playlistModerate(req, deps, cookies, id, action);
    }

    // Phases G/H/I: rooms, chat, voice (reports; realtime-only honest placeholders).
    if (path === "/api/admin/rooms") return reports.gate(req, deps, cookies, "rooms.manage", "rooms");
    if (path === "/api/admin/chat") return reports.gate(req, deps, cookies, "chat.moderate", "chat");
    if (path === "/api/admin/voice") return reports.gate(req, deps, cookies, "voice.read", "voice");

    // Phase J: traffic analytics + CSV export (server generated).
    if (path === "/api/admin/traffic/export.csv") return trafficCsv(req, deps, cookies);
    if (path === "/api/admin/traffic") return reports.gate(req, deps, cookies, "traffic.read", "traffic");

    // Phase K: imports & resolution monitoring.
    if (path === "/api/admin/imports") return reports.gate(req, deps, cookies, "imports.read", "imports");

    // Phase L: system health + error center.
    if (path === "/api/admin/system") return reports.gate(req, deps, cookies, "health.read", "system");
    if (path === "/api/admin/errors") return reports.gate(req, deps, cookies, "errors.read", "errors");

    // Phase M: performance report (indexes + query budget).
    if (path === "/api/admin/perf") return reports.gate(req, deps, cookies, "health.read", "perf");

    if (path === "/api/admin/audit" || path === "/api/admin/audit/") {
      if (method !== "GET") return json(405, { error: "Method not allowed." });
      return auditList(req, deps, cookies);
    }

    if (path === "/api/admin/dashboard" || path === "/api/admin/dashboard/") {
      if (method !== "GET") return json(405, { error: "Method not allowed." });
      return dashboard(req, deps, cookies);
    }

    return json(404, { error: "Not found." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin] unhandled", msg);
    return json(500, { error: "Internal server error." });
  }
}

// ---------------------------------------------------------------------------
// Session validation (server-side, trusted)
// ---------------------------------------------------------------------------

async function requireSession(
  req: RouteRequest,
  deps: RouterDeps,
  cookies: Map<string, string>,
  opts: { csrfRequired: boolean },
): Promise<{ ok: true; session: AdminSession; admin: AdminUser; csrfToken: string } | RouteResult> {
  const rawToken = cookies.get(SESSION_COOKIE);
  if (!rawToken) return denied();
  const session = await deps.db.getSessionByTokenHash(tokenDigest(rawToken));
  if (!session) return denied();
  if (session.revoked_at) return denied();
  const expires = toEpochMs(session.expires_at);
  if (expires == null || expires <= req.now) return denied();
  const admin = await deps.db.getAdminByUsername(session.admin_id);
  if (!admin) return denied();
  if (opts.csrfRequired) {
    const cookieCsrf = cookies.get(CSRF_COOKIE);
    if (!csrfOk(cookieCsrf, req.csrfHeader ?? undefined)) return json(403, { error: "CSRF validation failed." });
  }
  return { ok: true, session, admin, csrfToken: cookies.get(CSRF_COOKIE) ?? generateCsrfToken() };
}

/**
 * Session validation + role gate in one step. Returns a 403 when the caller's
 * role lacks the required permission (Phase B: least privilege by default).
 */
async function requirePermission(
  req: RouteRequest,
  deps: RouterDeps,
  cookies: Map<string, string>,
  permission: AdminAction,
  opts: { csrfRequired?: boolean } = { csrfRequired: true },
): Promise<{ ok: true; session: AdminSession; admin: AdminUser; csrfToken: string } | RouteResult> {
  const auth = await requireSession(req, deps, cookies, { csrfRequired: opts.csrfRequired ?? true });
  const ctx = unwrap(auth);
  if (!ctx) return auth as RouteResult;
  if (!authorize(ctx.admin.role, permission)) {
    await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: `authz.denied.${permission}`, result: "fail", reason: "insufficient_permission", meta: { required: permission } }, req);
    return json(403, { error: "You do not have permission to do that." });
  }
  return { ok: true, ...ctx } as { ok: true; session: AdminSession; admin: AdminUser; csrfToken: string };
}

/** Collapse the success/error union into either the session or null. */
function unwrap(got: ReturnType<typeof requireSession> extends Promise<infer U> ? U : never):
  { session: AdminSession; admin: AdminUser; csrfToken: string } | null {
  return "ok" in got ? got : null;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function login(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const { adminId, password } = (req.body ?? {}) as { adminId?: unknown; password?: unknown };
  if (typeof adminId !== "string" || typeof password !== "string" || !adminId || !password) {
    return denied();
  }

  // CSRF is required on login (state-changing): cookie must exist + match header.
  const cookieCsrf = cookies.get(CSRF_COOKIE);
  if (!csrfOk(cookieCsrf, req.csrfHeader ?? undefined)) {
    return json(403, { error: "CSRF validation failed." });
  }

  let admin = await deps.db.getAdminByUsername(adminId);

  // One-time bootstrap: only when the admin table is empty and server-only env
  // seed is present. Plaintext password NEVER touches frontend/repo — only a
  // server-side env var at deploy time, hashed immediately on first use.
  if (!admin) {
    const count = await deps.db.countAdmins();
    if (count === 0 && deps.seed && deps.seed.adminId === adminId) {
      await deps.db.createAdmin({
        admin_id: deps.seed.adminId,
        display_name: deps.seed.displayName || deps.seed.adminId,
        role: "SUPER_ADMIN",
        password_hash: await hashPassword(deps.seed.password),
      });
      admin = await deps.db.getAdminByUsername(adminId);
    }
  }

  if (!admin) {
    // Timing-equalizing dummy verify; identical response for unknown user.
    await verifyPassword(password, await dummyHash());
    await audit(deps, { admin_id: adminId, role: null, action: "auth.login.failed", result: "fail", reason: "unknown_admin", meta: { csrf_ok: true } }, req);
    return denied();
  }

  // Lockout gate.
  const probe = shouldAllowProbe(readBruteState(admin), req.now);
  if (!probe.allowed) {
    await audit(deps, { admin_id: adminId, role: admin.role, action: "auth.login.locked", result: "fail", reason: "temp_lock", meta: { retry_after_ms: probe.retryAfterMs } }, req);
    return json(429, { error: GENERIC_AUTH_DENIAL }, { retryAfterMs: probe.retryAfterMs });
  }

  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) {
    const nl = nextFailedState(readBruteState(admin), req.now);
    await deps.db.updateFailedAttempts(adminId, nl.failedAttempts, nl.lockedUntil == null ? null : new Date(nl.lockedUntil).toISOString());
    await audit(deps, { admin_id: adminId, role: admin.role, action: "auth.login.failed", result: "fail", reason: "bad_password", meta: { failures: nl.failedAttempts, lock_seconds: nl.lockedUntil == null ? 0 : Math.round((nl.lockedUntil - req.now) / 1000) } }, req);
    return denied();
  }

  // Success: reset failures, create session, set cookies.
  await deps.db.resetFailedAttempts(adminId);
  await deps.db.updateLastLogin(adminId, new Date(req.now).toISOString());

  const token = generateToken();
  const sessionId = await deps.db.createSession({
    admin_id: adminId,
    token_sha256: tokenDigest(token),
    ip_address: req.ip,
    user_agent: req.userAgent,
    expires_at: new Date(req.now + SESSION_TTL_MS).toISOString(),
  });

  await audit(deps, { admin_id: adminId, role: admin.role, action: "auth.login", result: "ok", target_type: "session", target_id: sessionId }, req);

  const csrf = csrfTokenFor();
  return json(200, { admin_id: admin.admin_id, display_name: admin.display_name, role: admin.role, must_change_password: admin.must_change_password }, {
    setCookies: [
      buildCookie(SESSION_COOKIE, token, { httpOnly: true, secure: secure(req), sameSite: "Strict", path: COOKIE_PATH, maxAgeSeconds: SESSION_TTL_MS / 1000 }),
      buildCookie(CSRF_COOKIE, csrf.cookie, { httpOnly: false, secure: secure(req), sameSite: "Strict", path: CSRF_COOKIE_PATH }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Session info (mount-time check + phase-A shell)
// ---------------------------------------------------------------------------

async function sessionInfo(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requireSession(req, deps, cookies, { csrfRequired: false });
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;
  const { session, admin } = ctx;
  return json(200, {
    session_id: session.session_id,
    admin_id: session.admin_id,
    display_name: admin.display_name,
    role: admin.role,
    must_change_password: admin.must_change_password,
    permissions: effectiveGrants(admin.role),
    expires_at: session.expires_at,
  });
}

// ---------------------------------------------------------------------------
// Self (identity + role + effective grants, Phase B authorization map)
// ---------------------------------------------------------------------------

async function me(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requireSession(req, deps, cookies, { csrfRequired: false });
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;
  const { session, admin } = ctx;
  return json(200, {
    admin_id: admin.admin_id,
    display_name: admin.display_name,
    role: admin.role,
    permissions: effectiveGrants(admin.role),
    session_id: session.session_id,
    expires_at: session.expires_at,
  });
}

// ---------------------------------------------------------------------------
// Change password (server-side policy enforcement)
// ---------------------------------------------------------------------------

async function changePassword(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requireSession(req, deps, cookies, { csrfRequired: true });
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;
  const { session, admin } = ctx;

  const { currentPassword, newPassword } = (req.body ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
    return json(400, { error: "Current and new password are required." });
  }

  if (!(await verifyPassword(currentPassword, admin.password_hash))) {
    await audit(deps, { admin_id: admin.admin_id, role: admin.role, action: "auth.password.change_failed", result: "fail", reason: "bad_current" }, req);
    return json(403, { error: "Current password is incorrect." });
  }

  const policy = checkPasswordPolicy(newPassword, admin.admin_id);
  if (!policy.ok) {
    await audit(deps, { admin_id: admin.admin_id, role: admin.role, action: "auth.password.change_failed", result: "fail", reason: "policy", meta: { reasons: policy.reasons } }, req);
    return json(400, { error: "New password does not meet policy.", reasons: policy.reasons });
  }

  const newHash = await hashPassword(newPassword);
  await deps.db.updatePassword(admin.admin_id, newHash);
  await deps.db.clearMustChange(admin.admin_id);
  if (!admin.must_change_password) {
    // Voluntary change also revokes other open sessions (defense-in-depth).
    await deps.db.revokeOthers(admin.admin_id, session.session_id);
  }

  // Rotate the current session token so the old cookie dies instantly.
  const newToken = generateToken();
  await deps.db.replaceSession(session.session_id, tokenDigest(newToken), new Date(req.now + SESSION_TTL_MS).toISOString());

  await audit(deps, { admin_id: admin.admin_id, role: admin.role, action: "auth.password.change", result: "ok", target_type: "session", target_id: session.session_id }, req);

  const csrf = csrfTokenFor();
  return json(200, { ok: true }, {
    setCookies: [
      buildCookie(SESSION_COOKIE, newToken, { httpOnly: true, secure: secure(req), sameSite: "Strict", path: COOKIE_PATH, maxAgeSeconds: SESSION_TTL_MS / 1000 }),
      buildCookie(CSRF_COOKIE, csrf.cookie, { httpOnly: false, secure: secure(req), sameSite: "Strict", path: CSRF_COOKIE_PATH }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

async function logout(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requireSession(req, deps, cookies, { csrfRequired: true });
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;
  const { session, admin } = ctx;
  await deps.db.revokeSession(session.session_id);
  await audit(deps, { admin_id: session.admin_id, role: admin.role, action: "auth.logout", result: "ok", target_type: "session", target_id: session.session_id }, req);
  return json(200, { ok: true }, {
    clearCookies: [
      buildCookie(SESSION_COOKIE, "", { httpOnly: true, secure: secure(req), sameSite: "Strict", path: COOKIE_PATH, maxAgeSeconds: 0 }),
      buildCookie(CSRF_COOKIE, "", { httpOnly: false, secure: secure(req), sameSite: "Strict", path: CSRF_COOKIE_PATH, maxAgeSeconds: 0 }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Audit trail (Phase B: SUPER_ADMIN-only read — MODERATOR/ADMIN explicitly excluded)
// ---------------------------------------------------------------------------

async function auditList(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requirePermission(req, deps, cookies, "audit.read", { csrfRequired: false });
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;
  const entries = await deps.db.listAudit(50);
  await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: "audit.read", result: "ok", target_type: "audit", target_id: null }, req);
  return json(200, { entries });
}

// ---------------------------------------------------------------------------
// Dashboard (Phase C: server-computed live cards, no raw rows or secrets)
// ---------------------------------------------------------------------------

async function dashboard(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requirePermission(req, deps, cookies, "dashboard.read", { csrfRequired: false });
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;
  const cards = await deps.db.dashboardLive();
  await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: "dashboard.read", result: "ok", target_type: "dashboard", target_id: null }, req);
  return json(200, { cards });
}

// ---------------------------------------------------------------------------
// Reports (Phase D–L). One shared gate: read report data (which lives server-
// side in a SECURITY DEFINER RPC — no raw rows/secrets, never reaches client).
// ---------------------------------------------------------------------------

const reports: {
  gate: (req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>, permission: AdminAction, kind: Parameters<AdminDb["report"]>[0]) => Promise<RouteResult>;
} = {
  async gate(req, deps, cookies, permission, kind) {
    const got = await requirePermission(req, deps, cookies, permission, { csrfRequired: false });
    const ctx = unwrap(got);
    if (!ctx) return got as RouteResult;
    const data = await deps.db.report(kind);
    await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: `report.${kind}`, result: "ok", target_type: "report", target_id: kind }, req);
    return json(200, { data });
  },
};

// ---------------------------------------------------------------------------
// Sessions (Phase D) — list is a report; revoke is destructive & audited
// ---------------------------------------------------------------------------

async function sessionRevoke(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requirePermission(req, deps, cookies, "sessions.revoke");
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;

  const { session_id } = (req.body ?? {}) as { session_id?: unknown };
  if (typeof session_id !== "string" || !session_id) {
    return json(400, { error: "session_id is required." });
  }
  const sessions = await deps.db.listAdminSessions();
  const target = sessions.find((s) => s.session_id === session_id);
  if (!target) return json(404, { error: "Session not found." });
  if (target.session_id === ctx.session.session_id) {
    return json(400, { error: "You cannot revoke your own active session here; use Sign out." });
  }

  await deps.db.revokeSession(session_id);
  await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: "session.revoke", result: "ok", target_type: "session", target_id: session_id }, req);
  return json(200, { ok: true, revoked: session_id, admin_id: target.admin_id });
}

// ---------------------------------------------------------------------------
// Admin management (Phase D/B — admin.manage; suicide-guard enforced)
// ---------------------------------------------------------------------------

async function adminCreate(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requirePermission(req, deps, cookies, "admin.manage");
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;

  const { displayName, role, adminId } = (req.body ?? {}) as { displayName?: unknown; role?: unknown; adminId?: unknown };
  const newRole = String(role ?? "");
  if (!["ADMIN", "MODERATOR", "ANALYST"].includes(newRole)) {
    await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: "admin.create.denied", result: "fail", reason: "invalid_role", meta: { role: newRole } }, req);
    return json(400, { error: "Role must be one of ADMIN, MODERATOR, ANALYST." });
  }
  if (typeof displayName !== "string" || !displayName.trim()) {
    return json(400, { error: "displayName is required." });
  }
  const targetRole = newRole as AdminRole;
  if (!canManageTarget(ctx.admin.role, targetRole)) {
    await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: "admin.create.denied", result: "fail", reason: "suicide_guard", meta: { role: targetRole } }, req);
    return json(403, { error: "You do not have permission to do that." });
  }

  // Server-generated ids (never user-supplied) keep the admin_id namespace clean.
  const generatedId = adminId && typeof adminId === "string" && /^[A-Za-z0-9@._-]{3,64}$/.test(adminId)
    ? adminId
    : `admin_${generateToken().slice(0, 8)}`;
  const existing = await deps.db.getAdminByUsername(generatedId);
  if (existing) return json(409, { error: "An admin with that id already exists." });

  const tempPassword = generateToken();
  await deps.db.createAdmin({
    admin_id: generatedId,
    display_name: displayName.trim(),
    role: targetRole,
    password_hash: await hashPassword(tempPassword),
  });
  await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: "admin.create", result: "ok", target_type: "admin", target_id: generatedId, meta: { role: targetRole } }, req);

  return json(200, {
    ok: true,
    admin_id: generatedId,
    display_name: displayName.trim(),
    role: targetRole,
    // One-time value: the operator reads it immediately, hands it to the new admin,
    // and the account forces a password change on first sign-in.
    temp_password: tempPassword,
    must_change_password: true,
  });
}

// ---------------------------------------------------------------------------
// Playlist moderation (Phase F — destructive, audited)
// ---------------------------------------------------------------------------

async function playlistModerate(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>, playlistId: string, action: "hide" | "unhide" | "remove"): Promise<RouteResult> {
  const got = await requirePermission(req, deps, cookies, "playlists.moderate");
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;

  if (action === "hide" || action === "unhide") {
    await deps.db.setPlaylistHidden(playlistId, action === "hide");
  } else {
    await deps.db.removePlaylist(playlistId);
  }
  await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: `playlist.${action}`, result: "ok", target_type: "playlist", target_id: playlistId }, req);
  return json(200, { ok: true, action, playlist_id: playlistId });
}

// ---------------------------------------------------------------------------
// Traffic CSV export (Phase J — server generated)
// ---------------------------------------------------------------------------

async function trafficCsv(req: RouteRequest, deps: RouterDeps, cookies: Map<string, string>): Promise<RouteResult> {
  const got = await requirePermission(req, deps, cookies, "traffic.read", { csrfRequired: false });
  const ctx = unwrap(got);
  if (!ctx) return got as RouteResult;
  const data = await deps.db.report("traffic");
  const daily = Array.isArray(data.daily) ? (data.daily as { day: string; created: number }[]) : [];
  const rows: string[] = ["day,playlists_created"];
  for (const d of daily) {
    rows.push(`${d.day},${d.created}`);
  }
  const csv = rows.join("\n");
  await audit(deps, { admin_id: ctx.admin.admin_id, role: ctx.admin.role, action: "traffic.export", result: "ok", target_type: "report", target_id: "traffic" }, req);
  return json(200, { csv, filename: "creespy-traffic.csv" });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function readBruteState(admin: AdminUser): { failedAttempts: number; lastFailureAt: number | null; lockedUntil: number | null } {
  return {
    failedAttempts: admin.failed_attempts,
    lastFailureAt: toEpochMs(admin.last_failure_at),
    lockedUntil: toEpochMs(admin.locked_until),
  };
}

async function audit(deps: RouterDeps, entry: Parameters<AdminDb["appendAudit"]>[0], req: RouteRequest): Promise<void> {
  try {
    await deps.db.appendAudit({ ...entry, ip_address: entry.ip_address ?? req.ip, result: entry.result });
  } catch {
    // Audit must never block the auth outcome.
  }
}