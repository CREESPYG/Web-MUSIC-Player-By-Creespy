// Client-side admin API — thin fetch wrappers. All authorization happens
// server-side in the Netlify function; this module only transports cookies.

const API = "/api/admin";

export interface SessionInfo {
  session_id: string;
  admin_id: string;
  display_name: string;
  role: string;
  must_change_password: boolean;
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

export { AdminApiError };