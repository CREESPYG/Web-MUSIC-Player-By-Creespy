-- ============================================================================
-- CREESPY ADMIN CONTROL PLANE — SCHEMA MIGRATION
-- Run this in the Supabase SQL Editor, or: supabase db push
--
-- SECURITY MODEL:
--   * admin_users     — one row per admin. password_hash is a scrypt digest
--                       (server-side only). NEVER selectable by anon/authenticated.
--   * admin_sessions  — stores ONLY a SHA-256 digest of the session token
--                       (never the raw cookie). Expiry + revocation enforced
--                       by the serverless function, not by the client.
--   * admin_audit     — append-only. RLS allows INSERT by the helper function,
--                       denies SELECT/DELETE to anon. The serverless function
--                       reads via the service-role key (privileged, server-side).
--
-- RLS: 'policy_user' is the serverless function's DB role (grab your own in
-- Production; the public anon role can touch NOTHING here).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. ADMIN USERS
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  admin_id          text primary key,              -- the sign-in identifier
  display_name      text not null default 'Admin',
  role              text not null default 'SUPER_ADMIN',
  password_hash     text not null,                 -- scrypt digest (server-side)
  must_change_password boolean not null default true,
  failed_attempts   integer not null default 0,
  last_failure_at   timestamptz,
  locked_until      timestamptz,                   -- null = not locked
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists admin_users_role_idx on public.admin_users (role);

-- ---------------------------------------------------------------------------
-- 2. ADMIN SESSIONS  (only token_sha256 stored — never the raw token)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_sessions (
  session_id      uuid primary key default gen_random_uuid(),
  admin_id        text not null references public.admin_users (admin_id) on delete cascade,
  token_sha256    text not null unique,
  ip_address      text,
  user_agent      text,
  geo             jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  replaced_by     uuid
);

create index if not exists admin_sessions_admin_idx  on public.admin_sessions (admin_id);
create index if not exists admin_sessions_expires_idx on public.admin_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- 3. AUDIT LOG — append-only
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit (
  audit_id        bigint generated always as identity primary key,
  admin_id        text,
  role            text,
  ip_address      text,
  action          text not null,          -- e.g. auth.login, auth.login.failed, session.revoke, password.change
  target_type     text,                   -- e.g. session, user, room, playlist
  target_id       text,
  result          text not null,          -- ok | fail
  reason          text,
  meta            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists admin_audit_admin_idx    on public.admin_audit (admin_id, created_at);
create index if not exists admin_audit_action_idx   on public.admin_audit (action, created_at);

-- RLS: helper function uses SECURITY DEFINER so a privileged DB user can
-- append rows; the public can neither read nor write.
create or replace function public.admin_audit_append(
  p_admin_id text, p_role text, p_ip text, p_action text,
  p_target_type text default null, p_target_id text default null,
  p_result text default 'ok', p_reason text default null, p_meta jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit
    (admin_id, role, ip_address, action, target_type, target_id, result, reason, meta)
  values
    (p_admin_id, p_role, p_ip, p_action, p_target_type, p_target_id, p_result, p_reason, p_meta);
end;
$$;

revoke all on function public.admin_audit_append(text, text, text, text, text, text, text, text, jsonb) from public;
revoke all on public.admin_audit from anon, authenticated;
grant all on function public.admin_audit_append(text, text, text, text, text, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS ON THE LEAF TABLES (defense in depth)
-- ---------------------------------------------------------------------------
alter table public.admin_users    enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_audit    enable row level security;

-- No policy for anon/authenticated => implicit DENY. Only the serverless
-- function's privileged DB user (service_role) can access these tables.
-- If you instead run the serverless layer as an 'admin_app' role, grant it:
--   grant select, insert, update, delete on public.admin_users,
--     public.admin_sessions to admin_app;
--   grant select on public.admin_audit to admin_app;
--   grant usage, select on sequence public.admin_audit_audit_id_seq to admin_app;