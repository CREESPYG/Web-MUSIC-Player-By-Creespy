// ---------------------------------------------------------------------------
// CREESPY Admin — Roles & Server-Side Authorization
//
// Single source of truth for who may do what. Every admin endpoint in the
// router must pass through `authorize(role, action)` before touching data.
// Least privilege by default: a role holds only the grants it needs.
//
// Suicide-guard: SUPER_ADMIN cannot be created, promoted, demoted or edited
// through the API. That bucket is reachable ONLY by server-side bootstrap
// (ADMIN_INIT_* env at first-ever login) and DB-level manual changes, both
// audited. `canManageTarget` enforces this remote-proof rule.
// ---------------------------------------------------------------------------

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "MODERATOR" | "ANALYST";

export const ADMIN_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "ADMIN", "MODERATOR", "ANALYST"];

/** Every permission the admin plane can gate an endpoint on. */
export type AdminAction =
  | "auth.self" // own session / change own password / logout
  | "dashboard.read" // Phase C live cards
  | "users.list" // Phase D list player users
  | "users.session_revoke" // Phase D force-logout a user, revoke their sessions
  | "sessions.read" // Phase D admin sessions + revocation views
  | "audit.read" // audit trail (most restricted)
  | "admin.manage" // create/edit/demote NON-super admins (Phase B+; never a SUPER_ADMIN target)
  | "songs.read" // Phase E listening analytics
  | "playlists.moderate" // Phase F hide/remove public playlists
  | "rooms.manage" // Phase G end room / remove participant
  | "chat.moderate" // Phase H delete message / mute participant
  | "voice.read" // Phase I voice/realtime diagnostics
  | "traffic.read" // Phase J DAU/WAU/retention/export
  | "imports.read" // Phase K import & resolver health
  | "health.read" // Phase L system health / error center
  | "errors.read"; // Phase L error log detail (superset of health.read)

/** Actions that MUTATE or DESTROY state. Read-only roles must never hold one. */
export const WRITE_ACTIONS: readonly AdminAction[] = [
  "users.session_revoke",
  "admin.manage",
  "playlists.moderate",
  "rooms.manage",
  "chat.moderate",
];

/** Destructive subset — the highest-risk actions, audited with extra care. */
export const DESTRUCTIVE_ACTIONS: readonly AdminAction[] = [
  "users.session_revoke",
  "playlists.moderate",
  "rooms.manage",
  "chat.moderate",
];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminAction[]> = {
  SUPER_ADMIN: [
    "auth.self",
    "dashboard.read",
    "users.list",
    "users.session_revoke",
    "sessions.read",
    "audit.read",
    "admin.manage",
    "songs.read",
    "playlists.moderate",
    "rooms.manage",
    "chat.moderate",
    "voice.read",
    "traffic.read",
    "imports.read",
    "health.read",
    "errors.read",
  ],
  ADMIN: [
    "auth.self",
    "dashboard.read",
    "users.list",
    "users.session_revoke",
    "sessions.read",
    "songs.read",
    "playlists.moderate",
    "rooms.manage",
    "chat.moderate",
    "voice.read",
    "traffic.read",
    "imports.read",
    "health.read",
    "errors.read",
  ],
  MODERATOR: ["auth.self", "playlists.moderate", "rooms.manage", "chat.moderate", "health.read"],
  ANALYST: ["auth.self", "dashboard.read", "songs.read", "voice.read", "traffic.read", "imports.read", "health.read"],
};

export const ALL_ADMIN_ACTIONS: readonly AdminAction[] = [
  "auth.self",
  "dashboard.read",
  "users.list",
  "users.session_revoke",
  "sessions.read",
  "audit.read",
  "admin.manage",
  "songs.read",
  "playlists.moderate",
  "rooms.manage",
  "chat.moderate",
  "voice.read",
  "traffic.read",
  "imports.read",
  "health.read",
  "errors.read",
];

/** Does the role hold the requested permission? (the one true gate) */
export function authorize(role: AdminRole | null | undefined, action: AdminAction): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] ?? EMPTY).includes(action);
}

const EMPTY: readonly AdminAction[] = [];

/** Effective grants for a role (used by /auth/me and the SPA shell). */
export function effectiveGrants(role: AdminRole | null | undefined): AdminAction[] {
  return role ? [...(ROLE_PERMISSIONS[role] ?? EMPTY)] : [];
}

/**
 * No privilege escalation / suicide-guard:
 *  - Only SUPER_ADMIN may manage admins at all.
 *  - Even SUPER_ADMIN cannot target another SUPER_ADMIN remotely — that bucket
 *    is server-side bootstrap / DB only.
 * If targetRole is null (creating a new admin) the caller may create any role
 * EXCEPT SUPER_ADMIN.
 */
export function canManageTarget(actorRole: AdminRole | null | undefined, targetRole: AdminRole | null | undefined): boolean {
  if (actorRole !== "SUPER_ADMIN") return false;
  if (targetRole === "SUPER_ADMIN") return false;
  return true;
}

/** A pure role without grants (sanity check; nothing ships depending on it). */
export function isValidRole(value: unknown): value is AdminRole {
  return ADMIN_ROLES.includes(value as AdminRole);
}