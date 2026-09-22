import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES,
  ALL_ADMIN_ACTIONS,
  DESTRUCTIVE_ACTIONS,
  WRITE_ACTIONS,
  ROLE_PERMISSIONS,
  authorize,
  canManageTarget,
  effectiveGrants,
  isValidRole,
} from "./rbac";

describe("rbac — role/permission matrix", () => {
  it("has exactly the four admin roles, least privilege by default", () => {
    expect(ADMIN_ROLES).toEqual(["SUPER_ADMIN", "ADMIN", "MODERATOR", "ANALYST"]);
  });

  it("every role holds the auth.self action (own login/session/logout/change)", () => {
    for (const role of ADMIN_ROLES) {
      expect(authorize(role, "auth.self")).toBe(true);
    }
  });

  it("MODERATOR cannot see sessions or audit (spec Phase B bullet)", () => {
    const forbidden = ["sessions.read", "audit.read", "admin.manage", "users.list", "users.session_revoke"] as const;
    for (const action of forbidden) {
      expect(authorize("MODERATOR", action)).toBe(false);
    }
  });

  it("ANALYST is strictly read-only analytics — holds zero write/destructive actions", () => {
    for (const act of WRITE_ACTIONS) {
      expect(authorize("ANALYST", act), `ANALYST must not hold ${act}`).toBe(false);
    }
    expect(authorize("ANALYST", "songs.read")).toBe(true);
    expect(authorize("ANALYST", "traffic.read")).toBe(true);
    expect(authorize("ANALYST", "dashboard.read")).toBe(true);
  });

  it("ADMIN sees sessions but not the audit trail, and cannot manage admins", () => {
    expect(authorize("ADMIN", "sessions.read")).toBe(true);
    expect(authorize("ADMIN", "audit.read")).toBe(false);
    expect(authorize("ADMIN", "admin.manage")).toBe(false);
  });

  it("SUPER_ADMIN is the only role that may manage admins or read the audit trail", () => {
    for (const role of ADMIN_ROLES) {
      const expectGrant = role === "SUPER_ADMIN";
      expect(authorize(role, "admin.manage")).toBe(expectGrant);
      expect(authorize(role, "audit.read")).toBe(expectGrant);
    }
  });

  it("MODERATOR gets content moderation + health but no analytics/raw data", () => {
    expect(authorize("MODERATOR", "chat.moderate")).toBe(true);
    expect(authorize("MODERATOR", "rooms.manage")).toBe(true);
    expect(authorize("MODERATOR", "playlists.moderate")).toBe(true);
    expect(authorize("MODERATOR", "health.read")).toBe(true);
    for (const act of ["dashboard.read", "users.list", "songs.read", "traffic.read"] as const) {
      expect(authorize("MODERATOR", act)).toBe(false);
    }
  });

  it("unknown/invalid roles are denied everything (default deny)", () => {
    expect(authorize(null, "health.read")).toBe(false);
    expect(authorize(undefined, "auth.self")).toBe(false);
    expect(authorize("ROOT" as never, "audit.read")).toBe(false);
    expect(isValidRole("ROOT")).toBe(false);
  });

  it("effectiveGrants returns exactly the role's declared grants and never leaks others", () => {
    for (const role of ADMIN_ROLES) {
      const grants = effectiveGrants(role);
      const declared = ROLE_PERMISSIONS[role];
      expect(grants).toEqual([...declared]);
      const forbidden = ALL_ADMIN_ACTIONS.filter((a) => !declared.includes(a));
      for (const f of forbidden) expect(grants).not.toContain(f);
    }
  });

  it("every declared permission is a real known action (no typos in the matrix)", () => {
    for (const role of ADMIN_ROLES) {
      for (const action of ROLE_PERMISSIONS[role]) {
        expect(ALL_ADMIN_ACTIONS).toContain(action);
      }
    }
  });

  it("WRITE_ACTIONS and DESTRUCTIVE_ACTIONS are subsets of known actions", () => {
    for (const act of [...WRITE_ACTIONS, ...DESTRUCTIVE_ACTIONS]) {
      expect(ALL_ADMIN_ACTIONS).toContain(act);
    }
  });
});

describe("rbac — no privilege escalation (SUPER_ADMIN cannot be edited/created remotely)", () => {
  it("only SUPER_ADMIN may manage admins at all", () => {
    for (const role of ADMIN_ROLES) {
      expect(canManageTarget(role, "ADMIN")).toBe(role === "SUPER_ADMIN");
    }
  });

  it("even SUPER_ADMIN cannot target another SUPER_ADMIN remotely", () => {
    expect(canManageTarget("SUPER_ADMIN", "SUPER_ADMIN")).toBe(false);
  });

  it("SUPER_ADMIN can manage non-super targets (and create a new non-super admin)", () => {
    expect(canManageTarget("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(canManageTarget("SUPER_ADMIN", "MODERATOR")).toBe(true);
    expect(canManageTarget("SUPER_ADMIN", "ANALYST")).toBe(true);
    expect(canManageTarget("SUPER_ADMIN", null)).toBe(true); // creating a NEW admin: never SUPER_ADMIN anyway (null target => caller may create non-super roles only per rule)
  });

  it("ADMIN/MODERATOR/ANALYST cannot manage anyone (least privilege)", () => {
    for (const role of ["ADMIN", "MODERATOR", "ANALYST"] as const) {
      for (const target of ["SUPER_ADMIN", "ADMIN", "MODERATOR", "ANALYST", null] as const) {
        expect(canManageTarget(role, target)).toBe(false);
      }
    }
  });

  it("analyst has no destructive actions in the matrix (read-only)", () => {
    for (const act of DESTRUCTIVE_ACTIONS) {
      expect(authorize("ANALYST", act)).toBe(false);
    }
  });
});