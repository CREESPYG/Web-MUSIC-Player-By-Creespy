import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";

function scryptAsync(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// ---------------------------------------------------------------------------
// Constant-time primitives
// ---------------------------------------------------------------------------

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ---------------------------------------------------------------------------
// scrypt password hashing (server-side only)
// ---------------------------------------------------------------------------

export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64; // 128*N*r = 16MB, comfortably under OpenSSL's 32MB default maxmem

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const key = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  // format: scrypt$N$r$p$salt_b64$key_b64
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const nStr = parts[1];
  const rStr = parts[2];
  const pStr = parts[3];
  const saltB64 = parts[4];
  const keyB64 = parts[5];
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scryptAsync(password, salt, expected.length, { N, r, p });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// Password policy (Phase A core)
// ---------------------------------------------------------------------------

export interface PasswordPolicyResult {
  ok: boolean;
  reasons: string[];
}

export function checkPasswordPolicy(password: string, adminId: string): PasswordPolicyResult {
  const reasons: string[] = [];
  if (password.length < 10) reasons.push("At least 10 characters");
  if (!/[a-z]/.test(password)) reasons.push("At least one lowercase letter");
  if (!/[A-Z]/.test(password)) reasons.push("At least one uppercase letter");
  if (!/[0-9]/.test(password)) reasons.push("At least one number");
  if (!/[^A-Za-z0-9]/.test(password)) reasons.push("At least one symbol");
  const lowerAdmin = adminId.toLowerCase();
  const leet = (s: string) =>
    s
      .toLowerCase()
      .replace(/0/g, "o")
      .replace(/1/g, "i")
      .replace(/3/g, "e")
      .replace(/4/g, "a")
      .replace(/5/g, "s")
      .replace(/7/g, "t")
      .replace(/8/g, "b")
      .replace(/!/g, "i")
      .replace(/@/g, "a")
      .replace(/\$/g, "s");
  const pwLeet = leet(password);
  if (pwLeet.includes(leet(lowerAdmin))) reasons.push("Must not contain the admin ID");
  if (/(.)\1\1\1/.test(password)) reasons.push("No 4+ repeated characters in a row");
  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Session tokens (raw 256-bit token in cookie; only sha256 stored in DB)
// ---------------------------------------------------------------------------

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function allCookies(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) {
      try {
        map.set(name, decodeURIComponent(value));
      } catch {
        map.set(name, value);
      }
    }
  }
  return map;
}

export function buildCookie(name: string, value: string, opts: { httpOnly: boolean; secure: boolean; sameSite: "Strict" | "Lax" | "None"; path: string; maxAgeSeconds?: number }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.maxAgeSeconds != null) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// CSRF — double-submit cookie vs header (both random; server compares)
// ---------------------------------------------------------------------------

export const CSRF_COOKIE = "creespy_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function generateCsrfToken(): string {
  return randomBytes(18).toString("base64url");
}

export function csrfOk(csrfCookie: string | undefined, csrfHeader: string | undefined): boolean {
  if (!csrfCookie || !csrfHeader) return false;
  return timingSafeEqualStr(csrfCookie, csrfHeader);
}

// ---------------------------------------------------------------------------
// Brute-force: progressive delay + temporary lockout. Note: the *enforcement*
// happens in the DB layer (locked_until) so it survives function cold starts.
// ---------------------------------------------------------------------------

export const GENERIC_AUTH_DENIAL = "Invalid admin credentials.";

export interface BruteForceState {
  failedAttempts: number;
  lastFailureAt: number | null;
  lockedUntil: number | null;
}

export const LOCK_THRESHOLD = 5;
export const BASE_LOCK_MS = 30_000; // first lock 30s
export const LOCK_GROWTH = 2; // doubles
export const MAX_LOCK_MS = 15 * 60_000; // cap 15 min

export function isLocked(state: Pick<BruteForceState, "lockedUntil">, now: number): boolean {
  return state.lockedUntil != null && now < state.lockedUntil;
}

/** Next lock duration given how many locks have already fired this session. */
export function lockDurationMs(_failuresAtLock: number, lockCount: number): number {
  const base = BASE_LOCK_MS * Math.pow(LOCK_GROWTH, Math.max(0, lockCount));
  return Math.min(base, MAX_LOCK_MS);
}

/** After a lock expires, how many failed attempts are reset vs kept. */
export function failuresAfterExpiry(_state: BruteForceState, _now: number): number {
  return 0; // clean slate after lock expiry
}

export function shouldAllowProbe(state: BruteForceState, now: number): { allowed: boolean; lockedUntil: number | null; retryAfterMs: number } {
  if (!isLocked(state, now)) {
    return { allowed: true, lockedUntil: null, retryAfterMs: 0 };
  }
  return { allowed: false, lockedUntil: state.lockedUntil, retryAfterMs: state.lockedUntil! - now };
}

export function nextFailedState(state: BruteForceState, now: number): { failedAttempts: number; lockedUntil: number | null; lockCount: number } {
  const failures = state.failedAttempts + 1;
  if (failures >= LOCK_THRESHOLD) {
    const lockCount = state.lockedUntil != null && state.lockedUntil > now ? 1 : 0;
    return {
      failedAttempts: failures,
      lockedUntil: now + lockDurationMs(failures, lockCount),
      lockCount,
    };
  }
  return { failedAttempts: failures, lockedUntil: null, lockCount: 0 };
}