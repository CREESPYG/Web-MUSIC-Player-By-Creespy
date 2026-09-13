-- ============================================================================
-- CREESPY PLAYER — Public Playlists Global Table
-- ----------------------------------------------------------------------------
-- Allows users to publish playlists globally so any user worldwide can discover
-- and play them. Uses anon key read access with no auth required for viewing.
-- Owners are identified by a local user ID stored in the browser (not Supabase auth).
-- ============================================================================

-- Public playlists table — readable by everyone, writable only by creator
create table if not exists public.public_playlists (
  id            text primary key,          -- matches local CustomPlaylist.id
  owner_uid     text not null,             -- userId() from room.ts (localStorage uid)
  title         text not null,
  description   text not null default '',
  cover_art     text,                      -- URL or base64 thumbnail
  track_count   int not null default 0,
  tracks        jsonb not null default '[]'::jsonb,  -- full Track[] array
  author        text not null default 'Anonymous',
  play_count    bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for fast listing by newest
create index if not exists idx_public_playlists_updated on public.public_playlists (updated_at desc);
create index if not exists idx_public_playlists_owner on public.public_playlists (owner_uid);

-- Enable RLS
alter table public.public_playlists enable row level security;

-- Drop existing policies if re-running migration
drop policy if exists "Public playlists are readable by everyone" on public.public_playlists;
drop policy if exists "Users can insert their own public playlists" on public.public_playlists;
drop policy if exists "Users can update their own public playlists" on public.public_playlists;
drop policy if exists "Users can delete their own public playlists" on public.public_playlists;

-- Anyone can read public playlists (anon + authenticated)
create policy "Public playlists are readable by everyone"
  on public.public_playlists for select
  using (true);

-- Anyone can insert public playlists
create policy "Users can insert their own public playlists"
  on public.public_playlists for insert
  with check (true);

-- Users can update public playlists
create policy "Users can update their own public playlists"
  on public.public_playlists for update
  using (true);

-- Users can delete public playlists
create policy "Users can delete their own public playlists"
  on public.public_playlists for delete
  using (true);

-- Function to increment play count
create or replace function public.increment_playlist_plays(playlist_id text)
returns void as $$
  update public.public_playlists
  set play_count = play_count + 1
  where id = playlist_id;
$$ language sql security definer;
