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
      return json(404, { error: "Not found." });
    }

    // Every other admin endpoint requires an active session (Phase A: shell).
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