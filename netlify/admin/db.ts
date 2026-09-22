import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AdminRole } from "./rbac";

export type { AdminRole } from "./rbac";

export interface AdminUser {
  admin_id: string;
  display_name: string;
  role: AdminRole;
  password_hash: string;
  must_change_password: boolean;
  failed_attempts: number;
  last_failure_at: string | null;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface AdminSession {
  session_id: string;
  admin_id: string;
  token_sha256: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface AuditEntry {
  admin_id?: string | null;
  role?: string | null;
  ip_address?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  result: "ok" | "fail";
  reason?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Everything the router touches. Implemented by a Supabase adapter in prod;
 * tests provide an in-memory double.
 */
export interface AdminDb {
  getAdminByUsername(adminId: string): Promise<AdminUser | null>;
  createAdmin(input: { admin_id: string; display_name: string; role: AdminRole; password_hash: string }): Promise<void>;
  updateFailedAttempts(adminId: string, failedAttempts: number, lockedUntil: string | null): Promise<void>;
  resetFailedAttempts(adminId: string): Promise<void>;
  updateLastLogin(adminId: string, at: string): Promise<void>;
  updatePassword(adminId: string, passwordHash: string): Promise<void>;
  clearMustChange(adminId: string): Promise<void>;
  createSession(input: { admin_id: string; token_sha256: string; ip_address: string | null; user_agent: string | null; expires_at: string }): Promise<string>;
  getSessionByTokenHash(tokenSha256: string): Promise<AdminSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  revokeOthers(adminId: string, exceptSessionId: string): Promise<void>;
  replaceSession(sessionId: string, newTokenSha256: string, newExpiresAt: string): Promise<void>;
  countAdmins(): Promise<number>;
  appendAudit(entry: AuditEntry): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
}

/** Parse "expires_at"/"locked_until" to epoch ms safely. */
export function toEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function supabaseError(context: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return `[admin-db:${context}] ${msg}`;
}

export function makeSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export class SupabaseAdminDb implements AdminDb {
  constructor(private client: SupabaseClient) {}

  async getAdminByUsername(adminId: string): Promise<AdminUser | null> {
    const { data, error } = await this.client
      .from("admin_users")
      .select("admin_id, display_name, role, password_hash, must_change_password, failed_attempts, last_failure_at, locked_until, last_login_at, created_at")
      .eq("admin_id", adminId)
      .maybeSingle();
    if (error) throw new Error(supabaseError("getAdminByUsername", error));
    return data as AdminUser | null;
  }

  async createAdmin(input: { admin_id: string; display_name: string; role: AdminRole; password_hash: string }): Promise<void> {
    const { error } = await this.client.from("admin_users").insert(input);
    if (error) throw new Error(supabaseError("createAdmin", error));
  }

  async updateFailedAttempts(adminId: string, failedAttempts: number, lockedUntil: string | null): Promise<void> {
    const patch: Record<string, unknown> = { failed_attempts: failedAttempts, last_failure_at: new Date().toISOString() };
    if (lockedUntil !== null) patch.locked_until = lockedUntil;
    const { error } = await this.client.from("admin_users").update(patch).eq("admin_id", adminId);
    if (error) throw new Error(supabaseError("updateFailedAttempts", error));
  }

  async resetFailedAttempts(adminId: string): Promise<void> {
    const { error } = await this.client
      .from("admin_users")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("admin_id", adminId);
    if (error) throw new Error(supabaseError("resetFailedAttempts", error));
  }

  async updateLastLogin(adminId: string, at: string): Promise<void> {
    const { error } = await this.client.from("admin_users").update({ last_login_at: at }).eq("admin_id", adminId);
    if (error) throw new Error(supabaseError("updateLastLogin", error));
  }

  async updatePassword(adminId: string, passwordHash: string): Promise<void> {
    const { error } = await this.client.from("admin_users").update({ password_hash: passwordHash }).eq("admin_id", adminId);
    if (error) throw new Error(supabaseError("updatePassword", error));
  }

  async clearMustChange(adminId: string): Promise<void> {
    const { error } = await this.client.from("admin_users").update({ must_change_password: false }).eq("admin_id", adminId);
    if (error) throw new Error(supabaseError("clearMustChange", error));
  }

  async createSession(input: { admin_id: string; token_sha256: string; ip_address: string | null; user_agent: string | null; expires_at: string }): Promise<string> {
    const { data, error } = await this.client
      .from("admin_sessions")
      .insert(input)
      .select("session_id")
      .single();
    if (error) throw new Error(supabaseError("createSession", error));
    return data.session_id as string;
  }

  async getSessionByTokenHash(tokenSha256: string): Promise<AdminSession | null> {
    const { data, error } = await this.client
      .from("admin_sessions")
      .select("session_id, admin_id, token_sha256, ip_address, user_agent, created_at, expires_at, revoked_at")
      .eq("token_sha256", tokenSha256)
      .maybeSingle();
    if (error) throw new Error(supabaseError("getSessionByTokenHash", error));
    return data as AdminSession | null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const { error } = await this.client.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("session_id", sessionId);
    if (error) throw new Error(supabaseError("revokeSession", error));
  }

  async revokeOthers(adminId: string, exceptSessionId: string): Promise<void> {
    const { error } = await this.client
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("admin_id", adminId)
      .neq("session_id", exceptSessionId)
      .is("revoked_at", null);
    if (error) throw new Error(supabaseError("revokeOthers", error));
  }

  async replaceSession(sessionId: string, newTokenSha256: string, newExpiresAt: string): Promise<void> {
    const { error } = await this.client
      .from("admin_sessions")
      .update({ token_sha256: newTokenSha256, expires_at: newExpiresAt, replaced_by: sessionId })
      .eq("session_id", sessionId);
    if (error) throw new Error(supabaseError("replaceSession", error));
  }

  async countAdmins(): Promise<number> {
    const { count, error } = await this.client.from("admin_users").select("admin_id", { count: "exact", head: true });
    if (error) throw new Error(supabaseError("countAdmins", error));
    return count ?? 0;
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    const { error } = await this.client.from("admin_audit").insert(entry);
    if (error) throw new Error(supabaseError("appendAudit", error));
  }

  async listAudit(limit: number): Promise<AuditEntry[]> {
    const { data, error } = await this.client
      .from("admin_audit")
      .select("admin_id, role, ip_address, action, target_type, target_id, result, reason, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(supabaseError("listAudit", error));
    return (data ?? []) as unknown as AuditEntry[];
  }
}