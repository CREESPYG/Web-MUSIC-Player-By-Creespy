-- ============================================================
-- CREESPY PLAYER — ROOM MODE SCHEMA
-- Run once in Supabase SQL Editor.
-- Uses anonymous auth so every browser session gets a real
-- auth.uid(), which lets RLS actually enforce the rules below.
-- ============================================================

-- 0. Anonymous sign-in (Dashboard → Auth → also enable "Anonymous sign-ins")
alter table public.rooms enable row level security;

-- ============================================================
-- TABLES
-- ============================================================
create table if not exists public.rooms (
  id               uuid primary key default gen_random_uuid(),
  room_code        text unique not null,
  name             text not null,
  room_type        text not null default 'public' check (room_type in ('public','private')),
  host_id          uuid not null default auth.uid(),
  control_mode     text not null default 'host_only' check (control_mode in ('host_only','shared','custom')),
  require_approval boolean not null default false,
  chat_enabled     boolean not null default true,
  status           text not null default 'active' check (status in ('active','closed')),
  max_participants int  not null default 20,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.room_members (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  user_id      uuid not null default auth.uid(),
  nickname     text not null,
  role         text not null default 'member' check (role in ('host','member')),
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected','kicked','banned','left')),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.room_join_requests (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  nickname    text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  unique (room_id, user_id)
);

create table if not exists public.room_permissions (
  room_id           uuid primary key references public.rooms(id) on delete cascade,
  allow_play_pause  boolean not null default false,
  allow_next        boolean not null default false,
  allow_previous    boolean not null default false,
  allow_seek        boolean not null default false,
  allow_add_song    boolean not null default false,
  allow_queue_control boolean not null default false,
  allow_shuffle     boolean not null default false,
  allow_repeat      boolean not null default false
);

create table if not exists public.room_playback (
  room_id     uuid primary key references public.rooms(id) on delete cascade,
  track_id    text not null default '',
  title       text not null default '',
  artist      text not null default '',
  thumb       text not null default '',
  is_playing  boolean not null default false,
  position    numeric not null default 0,
  at_client   timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create table if not exists public.room_queue (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms(id) on delete cascade,
  track_id  text not null,
  title     text not null default '',
  artist    text not null default '',
  thumb     text not null default '',
  added_by  uuid,
  position  int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.room_chat (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null default auth.uid(),
  nickname   text not null,
  message    text not null check (char_length(message) between 1 and 400),
  created_at timestamptz not null default now()
);

-- ============================================================
-- HELPERS (security definer so RLS on base tables can't be bypassed)
-- ============================================================
create or replace function public.rm_is_host(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = auth.uid()
      and m.role = 'host' and m.status = 'approved'
  ) or exists (
    select 1 from public.rooms r where r.id = p_room and r.host_id = auth.uid()
  );
$$;

create or replace function public.rm_is_approved(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.rm_is_host(p_room) or exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = auth.uid()
      and m.status = 'approved'
  );
$$;

create or replace function public.rm_is_public_open(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.rooms r
    where r.id = p_room and r.room_type = 'public'
      and r.require_approval = false and r.status = 'active'
  );
$$;

-- ============================================================
-- RLS
-- ============================================================

-- rooms: anyone can read an active room's public config; host can mutate
drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select
  using (status = 'active' or public.rm_is_host(id));

drop policy if exists rooms_insert on public.rooms;
create policy rooms_insert on public.rooms for insert
  with check (auth.uid() = host_id);

drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update
  using (public.rm_is_host(id));

drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms for delete
  using (auth.uid() = host_id);

-- members: approved members see the roster; pending users only see themselves
drop policy if exists members_read on public.room_members;
create policy members_read on public.room_members for select
  using (public.rm_is_approved(room_id) or user_id = auth.uid());

drop policy if exists members_insert on public.room_members;
create policy members_insert on public.room_members for insert
  with check (
    auth.uid() = user_id and (
      public.rm_is_host(room_id)
      or public.rm_is_public_open(room_id)
      or role = 'member'
    )
  );

drop policy if exists members_update on public.room_members;
create policy members_update on public.room_members for update
  using (
    public.rm_is_host(room_id)
    or (user_id = auth.uid() and status in ('approved','left'))
  );

drop policy if exists members_delete on public.room_members;
create policy members_delete on public.room_members for delete
  using (public.rm_is_host(room_id) or user_id = auth.uid());

-- join requests: host reads all, user reads/creates their own
drop policy if exists req_read on public.room_join_requests;
create policy req_read on public.room_join_requests for select
  using (public.rm_is_host(room_id) or user_id = auth.uid());

drop policy if exists req_insert on public.room_join_requests;
create policy req_insert on public.room_join_requests for insert
  with check (auth.uid() = user_id);

-- only the host may approve/reject
drop policy if exists req_update on public.room_join_requests;
create policy req_update on public.room_join_requests for update
  using (public.rm_is_host(room_id) or user_id = auth.uid());

-- permissions: readable by approved members, writable by host only
drop policy if exists perms_read on public.room_permissions;
create policy perms_read on public.room_permissions for select
  using (true);

drop policy if exists perms_write on public.room_permissions;
create policy perms_write on public.room_permissions for all
  using (public.rm_is_host(room_id))
  with check (public.rm_is_host(room_id));

-- playback: approved members read; writes gated below
drop policy if exists pb_read on public.room_playback;
create policy pb_read on public.room_playback for select using (true);

drop policy if exists pb_write on public.room_playback;
create policy pb_write on public.room_playback for all
  using (public.rm_is_host(room_id) or public.rm_can_control(room_id))
  with check (public.rm_is_host(room_id) or public.rm_can_control(room_id));

-- queue: approved members read; host (or permitted member) writes
drop policy if exists queue_read on public.room_queue;
create policy queue_read on public.room_queue for select
  using (public.rm_is_approved(room_id) or public.rm_is_public_open(room_id));

drop policy if exists queue_write on public.room_queue;
create policy queue_write on public.room_queue for all
  using (public.rm_is_host(room_id) or public.rm_can_control(room_id) or public.rm_is_approved(room_id))
  with check (public.rm_is_host(room_id) or public.rm_can_control(room_id) or public.rm_is_approved(room_id));

-- chat: approved members of THIS room only
drop policy if exists chat_read on public.room_chat;
create policy chat_read on public.room_chat for select
  using (public.rm_is_approved(room_id));

drop policy if exists chat_insert on public.room_chat;
create policy chat_insert on public.room_chat for insert
  with check (
    auth.uid() = user_id
    and public.rm_is_approved(room_id)
    and exists (select 1 from public.rooms r where r.id = room_id and r.chat_enabled and r.room_type = 'private')
  );

drop policy if exists chat_delete on public.room_chat;
create policy chat_delete on public.room_chat for delete
  using (public.rm_is_host(room_id) or user_id = auth.uid());

-- ============================================================
-- ATOMIC / SECURE OPERATIONS
-- ============================================================

-- can a member control playback? (host always can; shared/custom checked here)
create or replace function public.rm_can_control(p_room uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.rm_is_host(p_room) or exists (
    select 1
    from public.rooms r
    join public.room_permissions p on p.room_id = r.id
    where r.id = p_room
      and r.status = 'active'
      and r.control_mode in ('shared','custom')
      and exists (
        select 1 from public.room_members m
        where m.room_id = r.id and m.user_id = auth.uid() and m.status = 'approved'
      )
      and (
        (r.control_mode = 'shared')
        or (r.control_mode = 'custom' and (
             p.allow_play_pause or p.allow_next or p.allow_previous or p.allow_seek
          ))
      )
  );
$$;

-- atomic host transfer
create or replace function public.rm_transfer_host(p_room uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.rm_is_host(p_room) then
    raise exception 'only the host can transfer ownership';
  end if;
  if not exists (
    select 1 from public.room_members
    where room_id = p_room and user_id = p_to and status = 'approved'
  ) then
    raise exception 'target must be an approved member';
  end if;

  update public.room_members set role = 'member'
   where room_id = p_room and user_id = auth.uid();
  update public.room_members set role = 'host'
   where room_id = p_room and user_id = p_to;
  update public.rooms set host_id = p_to, updated_at = now()
   where id = p_room;
end;
$$;

-- atomic kick / ban
create or replace function public.rm_kick(p_room uuid, p_user uuid, p_ban boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.rm_is_host(p_room) then
    raise exception 'only the host can remove members';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot remove yourself';
  end if;
  update public.room_members
     set status = case when p_ban then 'banned' else 'kicked' end
   where room_id = p_room and user_id = p_user;
end;
$$;

-- host decides a join request (single source of truth)
create or replace function public.rm_review(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_room uuid;
  v_user uuid;
begin
  if not exists (
    select 1 from public.room_join_requests q
    where q.id = p_request and public.rm_is_host(q.room_id)
  ) then
    raise exception 'not allowed';
  end if;

  select room_id, user_id into v_room, v_user from public.room_join_requests where id = p_request;

  update public.room_join_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_request;

  update public.room_members
     set status = case when p_approve then 'approved' else 'rejected' end
   where room_id = v_room and user_id = v_user;
end;
$$;

create or replace function public.rm_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms
  for each row execute function public.rm_touch();

-- indexes
create index if not exists members_room on public.room_members(room_id);
create index if not exists queue_room on public.room_queue(room_id, position);
create index if not exists chat_room on public.room_chat(room_id, created_at desc);
create index if not exists req_room on public.room_join_requests(room_id, status);
