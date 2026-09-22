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

-- ---------------------------------------------------------------------------
-- 5. DASHBOARD — server-side computed live cards (Phase C)
--    Single SECURITY DEFINER query: all numbers are computed IN the database,
--    so the serverless function never ships raw rows to the client.
--    Caller = service_role (server-side) only; never granted to anon.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_live()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'users', jsonb_build_object(
      'distinct_owners',
        (select count(distinct owner_uid) from public.public_playlists),
      'publishers',
        (select count(distinct owner_uid) from public.public_playlists where track_count > 0),
      'admins',
        (select count(*) from public.admin_users)
    ),
    'playlists', jsonb_build_object(
      'count',
        (select count(*) from public.public_playlists),
      'total_tracks',
        (select coalesce(sum(track_count), 0) from public.public_playlists),
      'total_plays',
        (select coalesce(sum(play_count), 0) from public.public_playlists)
    ),
    'playback', jsonb_build_object(
      'source', 'play_count_total',
      'total_plays',
        (select coalesce(sum(play_count), 0) from public.public_playlists)
    ),
    'rooms', jsonb_build_object(
      'available', false,
      'note', 'Rooms are realtime-only (no persisted table yet); lands in Phase G.'
    ),
    'errors', jsonb_build_object(
      'failed_events_24h',
        (select count(*) from public.admin_audit
          where result = 'fail' and created_at > now() - interval '24 hours'),
      'total_audit_failures',
        (select count(*) from public.admin_audit where result = 'fail')
    ),
    'sessions', jsonb_build_object(
      'active',
        (select count(*) from public.admin_sessions
          where revoked_at is null and expires_at > now()),
      'total',
        (select count(*) from public.admin_sessions)
    ),
    'storage', jsonb_build_object(
      'total_tracks',
        (select coalesce(sum(track_count), 0) from public.public_playlists),
      'approx_bytes',
        (select coalesce(sum(pg_column_size(tracks) + 512), 0) from public.public_playlists)
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_live() from public;
grant execute on function public.admin_dashboard_live() to service_role;

-- ---------------------------------------------------------------------------
-- 5b. MODERATION SUPPORT — additive column on the player's table (default
--     false; the player reads nothing new, so this cannot break it).
-- ---------------------------------------------------------------------------
alter table public.public_playlists
  add column if not exists hidden boolean not null default false;

-- ---------------------------------------------------------------------------
-- 6. SERVER-SIDE REPORTS — single SECURITY DEFINER dispatcher used by the
--    Phase D–L endpoints. Every number is computed IN the database; the
--    serverless function never ships raw rows or secrets to the client.
--    Kind strings: users | admin_sessions | admins | songs | playlists |
--    rooms | chat | voice | traffic | imports | system | errors | perf
--    Honest-data rule: where the player keeps no persisted table (rooms /
--    chat / voice / DAU-WAU-MAU), the report returns an explicit "available:
--    false" + note instead of fabricating numbers.
-- ---------------------------------------------------------------------------
create or replace function public.admin_report(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  case p_kind
    when 'users' then
      select jsonb_build_object(
        'total_owners', (select count(distinct owner_uid) from public.public_playlists),
        'active_30d', (select count(distinct owner_uid) from public.public_playlists
                         where updated_at > now() - interval '30 days'),
        'active_7d', (select count(distinct owner_uid) from public.public_playlists
                        where updated_at > now() - interval '7 days'),
        'owners', coalesce((
          select jsonb_agg(row_to_json(u)) from (
            select
              owner_uid,
              count(*)::int as playlists,
              coalesce(sum(track_count), 0)::int as total_tracks,
              coalesce(sum(play_count), 0)::int as total_plays,
              max(updated_at) as last_active,
              min(created_at) as first_published
            from public.public_playlists
            group by owner_uid
            order by playlists desc, total_plays desc
            limit 100
          ) u
        ), '[]'::jsonb),
        'note', 'Owners are browser-level anonymous ids (no email/phone stored).'
      ) into v_result;

    when 'admin_sessions' then
      select jsonb_build_object(
        'active', (select count(*) from public.admin_sessions
                    where revoked_at is null and expires_at > now()),
        'expired', (select count(*) from public.admin_sessions
                      where revoked_at is null and expires_at <= now()),
        'revoked', (select count(*) from public.admin_sessions where revoked_at is not null),
        'sessions', coalesce((
          select jsonb_agg(row_to_json(s)) from (
            select
              s.session_id, s.admin_id, s.ip_address, s.user_agent, s.created_at,
              s.expires_at, s.revoked_at,
              (s.revoked_at is null and s.expires_at > now()) as active
            from public.admin_sessions s
            order by s.created_at desc
            limit 100
          ) s
        ), '[]'::jsonb)
      ) into v_result;

    when 'admins' then
      select jsonb_build_object(
        'admins', coalesce((
          select jsonb_agg(row_to_json(a)) from (
            select
              admin_id, display_name, role, must_change_password,
              failed_attempts, last_login_at, last_failure_at, created_at
            from public.admin_users
            order by created_at
          ) a
        ), '[]'::jsonb)
      ) into v_result;

    when 'playlists' then
      select jsonb_build_object(
        'total', (select count(*) from public.public_playlists),
        'hidden', (select count(*) from public.public_playlists where hidden),
        'playlists', coalesce((
          select jsonb_agg(row_to_json(p)) from (
            select
              id, title, author, owner_uid, track_count, play_count, hidden,
              created_at, updated_at
            from public.public_playlists
            order by updated_at desc
            limit 200
          ) p
        ), '[]'::jsonb)
      ) into v_result;

    when 'songs' then
      select jsonb_build_object(
        'total_tracks', coalesce((select sum(jsonb_array_length(coalesce(tracks, '[]'::jsonb)))
                                    from public.public_playlists), 0)::int,
        'total_plays', coalesce((select sum(play_count) from public.public_playlists), 0)::int,
        'by_source', coalesce((
          select jsonb_object_agg(platform, cnt) from (
            select coalesce(nullif(t->>'sourcePlatform',''), t->>'sourceType', 'unknown') as platform, count(*)::int as cnt
            from public.public_playlists p, jsonb_array_elements(coalesce(p.tracks, '[]'::jsonb)) t
            group by 1
          ) s
        ), '{}'::jsonb),
        'by_resolver', coalesce((
          select jsonb_object_agg(status, cnt) from (
            select coalesce(t->>'resolverStatus','UNRESOLVED') as status, count(*)::int as cnt
            from public.public_playlists p, jsonb_array_elements(coalesce(p.tracks, '[]'::jsonb)) t
            group by 1
          ) s
        ), '{}'::jsonb),
        'top_songs', coalesce((
          select jsonb_agg(row_to_json(s)) from (
            select
              t->>'title' as title,
              t->>'artist' as artist,
              count(*)::int as playlists_including,
              coalesce(sum(play_count), 0)::int as attributed_plays,
              (t->>'duration')::numeric::int as duration
            from public.public_playlists p, jsonb_array_elements(coalesce(p.tracks, '[]'::jsonb)) t
            group by t->>'title', t->>'artist', (t->>'duration')::numeric::int
            order by playlists_including desc, attributed_plays desc
            limit 50
          ) s
        ), '[]'::jsonb),
        'note', 'Per-song play/region/browser events are not persisted by the player; charts are computed from playlist inclusion + total plays.'
      ) into v_result;

    when 'traffic' then
      select jsonb_build_object(
        'playlists_created_7d', (select count(*) from public.public_playlists
                                   where created_at > now() - interval '7 days'),
        'playlists_created_30d', (select count(*) from public.public_playlists
                                    where created_at > now() - interval '30 days'),
        'active_owners_7d', (select count(distinct owner_uid) from public.public_playlists
                               where updated_at > now() - interval '7 days'),
        'active_owners_30d', (select count(distinct owner_uid) from public.public_playlists
                                where updated_at > now() - interval '30 days'),
        'total_plays', (select coalesce(sum(play_count), 0) from public.public_playlists)::int,
        'avg_plays_per_playlist', (select round(coalesce(sum(play_count),0)::numeric / nullif(count(*),0), 1)::float
                                     from public.public_playlists),
        'daily', coalesce((
          select jsonb_agg(row_to_json(d)) from (
            select date_trunc('day', created_at)::date as day, count(*)::int as created
            from public.public_playlists
            where created_at > now() - interval '30 days'
            group by 1 order by 1
          ) d
        ), '[]'::jsonb),
        'note', 'No persisted visit/auth stream exists; DAU/WAU/MAU, retention and time-spent cannot be measured honestly. Growth metrics above are playlist-author activity.'
      ) into v_result;

    when 'imports' then
      select jsonb_build_object(
        'total_tracks', coalesce((select sum(jsonb_array_length(coalesce(tracks, '[]'::jsonb)))
                                    from public.public_playlists), 0)::int,
        'resolution_rate', (select case when sum(jsonb_array_length(coalesce(tracks,'[]'::jsonb))) = 0 then null
                                        else round(100.0 * count(*) filter (where t->>'resolverStatus' not in ('UNRESOLVED','LOW'))
                                          / count(*), 1) end
                              from public.public_playlists p, jsonb_array_elements(coalesce(p.tracks,'[]'::jsonb)) t),
        'per_platform', coalesce((
          select jsonb_object_agg(platform, cnt) from (
            select coalesce(nullif(t->>'sourcePlatform',''), t->>'sourceType', 'unknown') as platform, count(*)::int as cnt
            from public.public_playlists p, jsonb_array_elements(coalesce(p.tracks, '[]'::jsonb)) t
            group by 1
          ) s
        ), '{}'::jsonb),
        'by_resolver', coalesce((
          select jsonb_object_agg(status, cnt) from (
            select coalesce(t->>'resolverStatus','UNRESOLVED') as status, count(*)::int as cnt
            from public.public_playlists p, jsonb_array_elements(coalesce(p.tracks, '[]'::jsonb)) t
            group by 1
          ) s
        ), '{}'::jsonb),
        'unresolved_sample', coalesce((
          select jsonb_agg(row_to_json(u)) from (
            select t->>'title' as title, t->>'artist' as artist,
                   coalesce(nullif(t->>'sourcePlatform',''), t->>'sourceType', 'unknown') as platform
            from public.public_playlists p, jsonb_array_elements(coalesce(p.tracks, '[]'::jsonb)) t
            where t->>'resolverStatus' in ('UNRESOLVED','LOW')
            limit 20
          ) u
        ), '[]'::jsonb)
      ) into v_result;

    when 'rooms' then
      select jsonb_build_object(
        'available', false,
        'note', 'Rooms are realtime-only (Supabase presence/broadcast); no persisted room table exists, so historical/joined lists are not available to the control plane.'
      ) into v_result;

    when 'chat' then
      select jsonb_build_object(
        'available', false,
        'note', 'Chat messages are realtime broadcast only — never persisted, so there is no moderation backlog to read or delete.'
      ) into v_result;

    when 'voice' then
      select jsonb_build_object(
        'available', false,
        'note', 'Voice/WebRTC state is transient (in-memory peer maps + realtime signaling); no persisted telemetry exists for the control plane.'
      ) into v_result;

    when 'system' then
      select jsonb_build_object(
        'latency_ms', round(extract(epoch from (clock_timestamp() - statement_timestamp())) * 1000, 2)::float,
        'row_counts', jsonb_build_object(
          'public_playlists', (select count(*) from public.public_playlists),
          'admin_users', (select count(*) from public.admin_users),
          'admin_sessions', (select count(*) from public.admin_sessions),
          'admin_audit', (select count(*) from public.admin_audit)
        ),
        'db_running', true,
        'storage_approx_bytes', coalesce((select sum(pg_column_size(public_playlists) + 512)
                                           from public.public_playlists), 0)::int,
        'checks', jsonb_build_array(
          jsonb_build_object('name', 'main.playlists.readable', 'ok', true),
          jsonb_build_object('name', 'admin.audit.appendable', 'ok', true)
        )
      ) into v_result;

    when 'errors' then
      select jsonb_build_object(
        'failed_24h', (select count(*) from public.admin_audit
                         where result = 'fail' and created_at > now() - interval '24 hours'),
        'total_failures', (select count(*) from public.admin_audit where result = 'fail'),
        'recent', coalesce((
          select jsonb_agg(row_to_json(e)) from (
            select created_at, admin_id, action, reason, ip_address, result
            from public.admin_audit
            where result = 'fail'
            order by created_at desc
            limit 50
          ) e
        ), '[]'::jsonb),
        'note', 'Error center reads server-side audit failures only; no secrets are stored there.'
      ) into v_result;

    when 'perf' then
      select jsonb_build_object(
        'hot_path_indexes', jsonb_build_array(
          jsonb_build_object('path', 'public_playlists.updated_at', 'present',
            (select true from pg_indexes where schemaname='public' and tablename='public_playlists' and indexdef ilike '%updated_at%')),
          jsonb_build_object('path', 'public_playlists.owner_uid', 'present',
            (select true from pg_indexes where schemaname='public' and tablename='public_playlists' and indexdef ilike '%owner_uid%')),
          jsonb_build_object('path', 'public_playlists.created_at', 'present',
            (select true from pg_indexes where schemaname='public' and tablename='public_playlists' and indexdef ilike '%created_at%')),
          jsonb_build_object('path', 'admin_sessions.expires_at', 'present',
            (select true from pg_indexes where schemaname='public' and tablename='admin_sessions' and indexdef ilike '%expires_at%'))
        ),
        'dashboard_query_budget_ms', 500
      ) into v_result;

    else
      select jsonb_build_object('error', 'unknown report kind: ' || p_kind) into v_result;
  end case;

  return v_result;
end;
$$;

revoke all on function public.admin_report(text) from public;
grant execute on function public.admin_report(text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. PERFORMANCE / AGGREGATION MIGRATION (Phase M) — additive hot-path indexes
-- ---------------------------------------------------------------------------
create index if not exists public_playlists_created_at_idx on public.public_playlists (created_at desc);
create index if not exists public_playlists_play_count_idx on public.public_playlists (play_count desc);
create index if not exists public_playlists_hidden_idx      on public.public_playlists (hidden) where hidden;
create index if not exists admin_sessions_created_idx       on public.admin_sessions (created_at desc);
create index if not exists admin_sessions_active_idx        on public.admin_sessions (revoked_at, expires_at);