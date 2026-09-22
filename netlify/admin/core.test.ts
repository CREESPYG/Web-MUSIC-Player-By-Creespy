import { describe, expect, it } from "vitest";
import {
  buildCookie,
  checkPasswordPolicy,
  csrfOk,
  generateCsrfToken,
  generateToken,
  hashPassword,
  tokenDigest,
  verifyPassword,
} from "./core";

describe("scrypt password hashing (server-side)", () => {
  it("hashes and verifies a password round-trip", async () => {
    const hash = await hashPassword("Creespy@Admin123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Creespy@Admin123", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Creespy@Admin123");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a unique salt each time", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });

  it("rejects malformed stored formats (not a hash)", async () => {
    expect(await verifyPassword("x", "not-a-valid-format")).toBe(false);
  });
});

describe("password policy", () => {
  it("accepts a strong password", () => {
    const r = checkPasswordPolicy("Zag#5!ko82Nrt", "Creespy@Player");
    expect(r.ok).toBe(true);
  });

  it("rejects too-short / weak passwords with reasons", () => {
    const r = checkPasswordPolicy("abc123", "Creespy@Player");
    expect(r.ok).toBe(false);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("rejects a password containing the admin id", () => {
    const r = checkPasswordPolicy("Xy$2creespy@player#", "Creespy@Player");
    expect(r.ok).toBe(false);
  });
});

describe("session tokens", () => {
  it("never reveals the raw token via digest", () => {
    const token = generateToken();
    expect(tokenDigest(token)).not.toContain(token);
    expect(tokenDigest(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs per token", () => {
    expect(tokenDigest(generateToken())).not.toBe(tokenDigest(generateToken()));
  });

  it("is high-entropy (32 random bytes)", () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThan(40);
  });
});

describe("cookies", () => {
  it("round-trips through a cookie header", () => {
    const cookie = buildCookie("creespy_admin_session", "abc=+123", { httpOnly: true, secure: true, sameSite: "Strict", path: "/api/admin", maxAgeSeconds: 300 });
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });
});

describe("CSRF double-submit", () => {
  it("accepts matching cookie+header", () => {
    const t = generateCsrfToken();
    expect(csrfOk(t, t)).toBe(true);
  });

  it("rejects mismatch or missing", () => {
    expect(csrfOk(generateCsrfToken(), generateCsrfToken())).toBe(false);
    expect(csrfOk(undefined, undefined)).toBe(false);
    expect(csrfOk(undefined, "x")).toBe(false);
    expect(csrfOk("x", undefined)).toBe(false);
  });
});