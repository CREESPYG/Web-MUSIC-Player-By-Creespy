// Client-side admin API — thin fetch wrappers. All authorization happens
// server-side in the Netlify function; this module only transports cookies.

const API = "/api/admin";

export interface SessionInfo {
  session_id: string;
  admin_id: string;
  display_name: string;
  role: string;
  must_change_password: boolean;
  permissions: string[];
  expires_at: string;
}

class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public reasons?: string[],
  ) {
    super(message);
  }
}

function readCsrf(): string {
  const m = /(?:^|;\s*)creespy_csrf=([^;]+)/.exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : "";
}

async function req<T>(
  path: string,
  init: { method?: string; body?: unknown; withCsrf?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.withCsrf) headers["x-csrf-token"] = readCsrf();
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers,
    credentials: "same-origin",
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  });
  let data: { error?: string; reasons?: string[] } = {};
  try {
    data = (await res.json()) as { error?: string; reasons?: string[] };
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    throw new AdminApiError(res.status, data.error ?? `Request failed (${res.status}).`, data.reasons);
  }
  return data as T;
}

export function health(): Promise<{ status: string }> {
  return req("/health");
}

export function fetchSession(): Promise<SessionInfo> {
  return req<SessionInfo>("/auth/session");
}

export interface LoginResult {
  admin_id: string;
  display_name: string;
  role: string;
  must_change_password: boolean;
}

export function login(adminId: string, password: string): Promise<LoginResult> {
  return req<LoginResult>("/auth/login", {
    method: "POST",
    body: { adminId, password },
    withCsrf: true,
  });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>("/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
    withCsrf: true,
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>("/auth/logout", { method: "POST", withCsrf: true });
}

export interface DashboardCards {
  users: { distinct_owners: number; publishers: number; admins: number };
  playlists: { count: number; total_tracks: number; total_plays: number };
  playback: { source: string; total_plays: number };
  rooms: { available: boolean; note?: string };
  errors: { failed_events_24h: number; total_audit_failures: number };
  sessions: { active: number; total: number };
  storage: { total_tracks: number; approx_bytes: number };
}

export function fetchDashboard(): Promise<{ cards: DashboardCards }> {
  return req<{ cards: DashboardCards }>("/dashboard");
}

// ---------------------------------------------------------------------------
// Reports + moderation (Phases D–L)
// ---------------------------------------------------------------------------

export type ReportKind =
  | "users"
  | "admin_sessions"
  | "admins"
  | "songs"
  | "playlists"
  | "rooms"
  | "chat"
  | "voice"
  | "traffic"
  | "imports"
  | "system"
  | "errors"
  | "perf";

export function fetchReport(kind: ReportKind): Promise<{ data: Record<string, unknown> }> {
  return req<{ data: Record<string, unknown> }>(`/${kind === "admin_sessions" ? "sessions" : kind}`);
}

export function revokeSession(sessionId: string): Promise<{ ok: boolean; revoked: string; admin_id: string }> {
  return req<{ ok: boolean; revoked: string; admin_id: string }>("/sessions", {
    method: "POST",
    body: { session_id: sessionId },
    withCsrf: true,
  });
}

export interface CreateAdminResult {
  ok: boolean;
  admin_id: string;
  display_name: string;
  role: string;
  temp_password: string;
  must_change_password: boolean;
}

export function createAdmin(input: { displayName: string; role: string; adminId?: string }): Promise<CreateAdminResult> {
  return req<CreateAdminResult>("/admins", { method: "POST", body: input, withCsrf: true });
}

export function hidePlaylist(id: string): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>(`/playlists/hide/${encodeURIComponent(id)}`, { method: "POST", withCsrf: true });
}

export function unhidePlaylist(id: string): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>(`/playlists/unhide/${encodeURIComponent(id)}`, { method: "POST", withCsrf: true });
}

export function removePlaylist(id: string): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>(`/playlists/remove/${encodeURIComponent(id)}`, { method: "POST", withCsrf: true });
}

export function fetchTrafficCsv(): Promise<{ csv: string }> {
  return req<{ csv: string }>("/traffic/export.csv");
}

export { AdminApiError };