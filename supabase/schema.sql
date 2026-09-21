-- CREESPY PLAYER — Supabase schema & realtime setup
-- Apply in the Supabase SQL editor of the project behind VITE_SUPABASE_URL.
-- Idempotent: safe to re-run.

-- ===========================================================================
-- 1. public_playlists table (read/written by src/lib/publicPlaylists.ts)
--    Columns mirror the PublicPlaylistRow type in that module.
-- ===========================================================================
create table if not exists public.public_playlists (
  id          text primary key,              -- playlist.id (client-generated)
  owner_uid   text not null,                 -- browser localStorage userId()
  title       text not null,
  description text not null default '',
  cover_art   text,
  track_count integer not null default 0,
  tracks      jsonb   not null default '[]'::jsonb,
  author      text    not null default 'Anonymous',
  play_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Read paths used by the app
create index if not exists public_playlists_updated_at_idx on public.public_playlists (updated_at desc);
create index if not exists public_playlists_owner_uid_idx  on public.public_playlists (owner_uid);

-- ===========================================================================
-- 2. play-count RPC (referenced by incrementPlayCount(); not yet wired to UI)
-- ===========================================================================
create or replace function public.increment_playlist_plays(playlist_id text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.public_playlists set play_count = play_count + 1 where id = playlist_id;
$$;

grant execute on function public.increment_playlist_plays(text) to anon;

-- ===========================================================================
-- 3. Realtime — publish inserts/updates/deletes so the app's
--    subscribeToPublicPlaylists() postgres_changes subscription fires.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'public_playlists'
  ) then
    alter publication supabase_realtime add table public.public_playlists;
  end if;
end $$;

-- ===========================================================================
-- 4. Grants to anon role (this is the role the publishable key uses)
-- ===========================================================================
grant select, insert, update, delete on public.public_playlists to anon;
grant usage on schema public to anon;

-- ===========================================================================
-- 5. Row Level Security
-- ===========================================================================
alter table public.public_playlists enable row level security;

-- Reads: every visitor may see public playlists (matches app behavior).
drop policy if exists public_playlists_select_all on public.public_playlists;
create policy public_playlists_select_all on public.public_playlists
  for select using (true);

-- Writes: parity with the current app. The app sends owner_uid from the
-- client (userId()) and enforces ownership in JS (unpublishPlaylist deletes
-- only rows matching owner_uid). This policy therefore allows all anon writes.
drop policy if exists public_playlists_write_anon on public.public_playlists;
create policy public_playlists_write_anon on public.public_playlists
  for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- HARDENING PATH (NOT ACTIVE) — recommended once the app adopts Supabase
-- anonymous sign-in (supabase.auth.signInAnonymously()). That gives a real
-- auth.uid() uuid for the browser, letting the server enforce ownership.
-- Replace the write_anon policy above with:
--
--   drop policy if exists public_playlists_write_anon on public.public_playlists;
--   create policy public_playlists_insert_own on public.public_playlists
--     for insert with check (owner_uid = auth.uid()::text);
--   create policy public_playlists_update_own on public.public_playlists
--     for update using (owner_uid = auth.uid()::text);
--   create policy public_playlists_delete_own on public.public_playlists
--     for delete using (owner_uid = auth.uid()::text);
--
-- The client would then key rows on the stable anonymous user id instead of
-- the per-tab userId(), and unpublishPlaylist() ownership checks become real.
-- ---------------------------------------------------------------------------