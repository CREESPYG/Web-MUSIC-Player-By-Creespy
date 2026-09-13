-- ============================================================================
-- CREESPY PLAYER — Room Mode schema + RLS  (optional, for DB-backed persistence)
-- ----------------------------------------------------------------------------
-- The shipped app runs Room Mode entirely on Supabase Realtime (broadcast +
-- presence) and needs NO tables to work. Apply this file only if you want
-- durable rooms, chat history, and server-enforced Row Level Security.
--
-- Run in Supabase → SQL Editor. Requires authenticated users (auth.uid()).
-- Never put the service-role key in the browser; the app uses the anon key.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------- rooms ----------------
create table if not exists public.rooms (
  id                uuid primary key default gen_random_uuid(),
  room_code         text unique not null,
  name              text not null,
  room_type         text not null check (room_type in ('public','private')),
  host_id           uuid not null references auth.users(id) on delete cascade,
  status            text not null default 'active' check (status in ('active','closed')),
  require_approval  boolean not null default false,
  max_participants  int not null default 50,
  chat_enabled      boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------- room_members ----------------
create table if not exists public.room_members (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  nickname      text not null,
  role          text not null default 'member' check (role in ('host','member')),
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','kicked','banned','left')),
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (room_id, user_id)
);

-- ---------------- room_join_requests ----------------
create table if not exists public.room_join_requests (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  nickname     text not null,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users(id)
);

-- ---------------- room_permissions ----------------
create table if not exists public.room_permissions (
  room_id            uuid primary key references public.rooms(id) on delete cascade,
  allow_play_pause   boolean not null default false,
  allow_next         boolean not null default false,
  allow_previous     boolean not null default false,
  allow_seek         boolean not null default false,
  allow_add_song     boolean not null default false,
  allow_queue_control boolean not null default false,
  allow_shuffle      boolean not null default false,
  allow_repeat       boolean not null default false,
  allow_volume       boolean not null default true
);

-- ---------------- room_playback (timestamp-synced, low-write) ----------------
create table if not exists public.room_playback (
  room_id     uuid primary key references public.rooms(id) on delete cascade,
  track_id    text,
  is_playing  boolean not null default false,
  position    double precision not null default 0,
  started_at  timestamptz,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

-- ---------------- room_queue ----------------
create table if not exists public.room_queue (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  track_id    text not null,
  added_by    uuid references auth.users(id),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------- room_chat (private rooms) ----------------
create table if not exists public.room_chat (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nickname    text not null,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- helper: is the caller an approved member of a room?
-- ============================================================================
create or replace function public.is_member(p_room uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from room_members
    where room_id = p_room and user_id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.is_host(p_room uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from rooms where id = p_room and host_id = auth.uid());
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.rooms              enable row level security;
alter table public.room_members       enable row level security;
alter table public.room_join_requests enable row level security;
alter table public.room_permissions   enable row level security;
alter table public.room_playback      enable row level security;
alter table public.room_queue         enable row level security;
alter table public.room_chat          enable row level security;

-- rooms: readable by members; public rooms discoverable by code lookup; host writes
drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select
  using (room_type = 'public' or host_id = auth.uid() or is_member(id));
drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms for insert with check (host_id = auth.uid());
drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update using (host_id = auth.uid());
drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms for delete using (host_id = auth.uid());

-- members: a user sees their own row + host sees all; only host mutates others
drop policy if exists members_read on public.room_members;
create policy members_read on public.room_members for select
  using (user_id = auth.uid() or is_host(room_id) or is_member(room_id));
drop policy if exists members_insert on public.room_members;
create policy members_insert on public.room_members for insert
  with check (user_id = auth.uid());              -- you may only add yourself (as pending)
drop policy if exists members_update on public.room_members;
create policy members_update on public.room_members for update
  using (is_host(room_id) or user_id = auth.uid());
drop policy if exists members_delete on public.room_members;
create policy members_delete on public.room_members for delete
  using (is_host(room_id) or user_id = auth.uid());

-- join requests: requester creates own; host reviews
drop policy if exists jr_read on public.room_join_requests;
create policy jr_read on public.room_join_requests for select
  using (user_id = auth.uid() or is_host(room_id));
drop policy if exists jr_insert on public.room_join_requests;
create policy jr_insert on public.room_join_requests for insert with check (user_id = auth.uid());
drop policy if exists jr_update on public.room_join_requests;
create policy jr_update on public.room_join_requests for update using (is_host(room_id));

-- permissions: members read, host writes
drop policy if exists perm_read on public.room_permissions;
create policy perm_read on public.room_permissions for select using (is_member(room_id) or is_host(room_id));
drop policy if exists perm_write on public.room_permissions;
create policy perm_write on public.room_permissions for all
  using (is_host(room_id)) with check (is_host(room_id));

-- playback: members read; host always writes; members write only if permitted
drop policy if exists pb_read on public.room_playback;
create policy pb_read on public.room_playback for select using (is_member(room_id) or is_host(room_id));
drop policy if exists pb_write on public.room_playback;
create policy pb_write on public.room_playback for all
  using (
    is_host(room_id)
    or exists (select 1 from room_permissions p where p.room_id = room_playback.room_id and p.allow_play_pause)
  )
  with check (
    is_host(room_id)
    or exists (select 1 from room_permissions p where p.room_id = room_playback.room_id and p.allow_play_pause)
  );

-- queue: members read; host + permitted members write
drop policy if exists q_read on public.room_queue;
create policy q_read on public.room_queue for select using (is_member(room_id) or is_host(room_id));
drop policy if exists q_write on public.room_queue;
create policy q_write on public.room_queue for all
  using (
    is_host(room_id)
    or exists (select 1 from room_permissions p where p.room_id = room_queue.room_id and p.allow_add_song)
  )
  with check (
    is_host(room_id)
    or exists (select 1 from room_permissions p where p.room_id = room_queue.room_id and p.allow_add_song)
  );

-- chat: ONLY approved members of the room can read/write; host can moderate
drop policy if exists chat_read on public.room_chat;
create policy chat_read on public.room_chat for select using (is_member(room_id) or is_host(room_id));
drop policy if exists chat_insert on public.room_chat;
create policy chat_insert on public.room_chat for insert
  with check ((is_member(room_id) or is_host(room_id)) and user_id = auth.uid());
drop policy if exists chat_delete on public.room_chat;
create policy chat_delete on public.room_chat for delete
  using (user_id = auth.uid() or is_host(room_id));

-- ============================================================================
-- secure host transfer (atomic)
-- ============================================================================
create or replace function public.transfer_host(p_room uuid, p_new_host uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_host(p_room) then raise exception 'not host'; end if;
  update rooms set host_id = p_new_host, updated_at = now() where id = p_room;
  update room_members set role = 'member' where room_id = p_room and role = 'host';
  update room_members set role = 'host' where room_id = p_room and user_id = p_new_host;
end;
$$;

-- realtime
alter publication supabase_realtime add table
  public.rooms, public.room_members, public.room_join_requests,
  public.room_permissions, public.room_playback, public.room_queue, public.room_chat;
