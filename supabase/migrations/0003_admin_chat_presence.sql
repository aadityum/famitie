-- Phase one, step 3: circle admin, leaving / removing members, last-seen, and text chat.
-- Run AFTER 0001 and 0002. Safe to run more than once.

-- ───────────── One admin per circle ─────────────
alter table family_members add column if not exists is_admin boolean not null default false;
alter table family_members add column if not exists last_seen_at timestamptz;

-- Existing circles: the creator (or, if they already left, the longest-standing member) becomes admin.
update family_members m set is_admin = true
where not exists (select 1 from family_members x where x.group_id = m.group_id and x.is_admin)
  and m.user_id = (
    select fm.user_id
    from family_members fm
    join family_groups g on g.id = fm.group_id
    where fm.group_id = m.group_id
    order by (fm.user_id = g.created_by) desc, fm.joined_at asc, fm.user_id
    limit 1
  );

update family_members set last_seen_at = joined_at where last_seen_at is null;

-- At most one admin per circle, enforced by the database itself.
create unique index if not exists one_admin_per_group on family_members (group_id) where is_admin;

create or replace function is_group_admin(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from family_members
    where group_id = gid and user_id = auth.uid() and is_admin
  );
$$;

-- Creating a circle makes you its admin.
create or replace function create_family_group(p_name text, p_role member_role default 'responder')
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Circle name is required'; end if;

  insert into family_groups (name, created_by) values (trim(p_name), auth.uid())
  returning id into gid;

  insert into family_members (group_id, user_id, role, is_admin, last_seen_at)
  values (gid, auth.uid(), p_role, true, now());
  return gid;
end $$;

-- Joining never changes admin status (a rejoin by the admin keeps them admin).
create or replace function join_family_group(p_code text, p_role member_role default 'responder')
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select id into gid from family_groups where invite_code = lower(trim(p_code));
  if gid is null then raise exception 'Invalid invite code'; end if;

  insert into family_members (group_id, user_id, role, is_admin, last_seen_at)
  values (gid, auth.uid(), p_role, false, now())
  on conflict (group_id, user_id) do update set role = excluded.role, last_seen_at = now();
  return gid;
end $$;

-- ───────────── Leaving: admin passes on automatically ─────────────
-- Leaving now goes only through leave_family_group(), so a circle can never be left without an admin.
drop policy if exists "members leave" on family_members;

create or replace function leave_family_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare was_admin boolean; next_admin uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select is_admin into was_admin from family_members
   where group_id = p_group and user_id = auth.uid();
  if not found then raise exception 'You are not in this circle'; end if;

  delete from family_members where group_id = p_group and user_id = auth.uid();

  if was_admin then
    -- Prefer a family member over the elder (the elder is the one who needs help, not the one managing),
    -- then whoever has been in the circle longest.
    select user_id into next_admin from family_members
     where group_id = p_group
     order by (role = 'elder'), joined_at, user_id
     limit 1;

    if next_admin is null then
      delete from family_groups where id = p_group;      -- last person left: circle is removed
    else
      update family_members set is_admin = true where group_id = p_group and user_id = next_admin;
    end if;
  end if;
end $$;

-- ───────────── Admin tools ─────────────
create or replace function remove_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_group_admin(p_group) then raise exception 'Only the admin can remove members'; end if;
  if p_user = auth.uid() then raise exception 'Use Leave circle to remove yourself'; end if;
  delete from family_members where group_id = p_group and user_id = p_user;
  if not found then raise exception 'That person is not in this circle'; end if;
end $$;

create or replace function transfer_admin(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_group_admin(p_group) then raise exception 'Only the admin can hand over admin'; end if;
  if p_user = auth.uid() then raise exception 'You are already the admin'; end if;
  if not exists (select 1 from family_members where group_id = p_group and user_id = p_user) then
    raise exception 'That person is not in this circle';
  end if;
  update family_members set is_admin = false where group_id = p_group and user_id = auth.uid();
  update family_members set is_admin = true  where group_id = p_group and user_id = p_user;
end $$;

-- Heartbeat: the app calls this when it opens and every few minutes while open.
-- It is how the circle tells who has gone inactive.
create or replace function touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update family_members set last_seen_at = now() where user_id = auth.uid();
$$;

revoke all on function is_group_admin(uuid) from public;
revoke all on function leave_family_group(uuid) from public;
revoke all on function remove_member(uuid, uuid) from public;
revoke all on function transfer_admin(uuid, uuid) from public;
revoke all on function touch_last_seen() from public;
grant execute on function is_group_admin(uuid) to authenticated;
grant execute on function leave_family_group(uuid) to authenticated;
grant execute on function remove_member(uuid, uuid) to authenticated;
grant execute on function transfer_admin(uuid, uuid) to authenticated;
grant execute on function touch_last_seen() to authenticated;

-- ───────────── Text chat ─────────────
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references family_groups(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_group_created on messages (group_id, created_at desc);

alter table messages enable row level security;

drop policy if exists "messages read" on messages;
drop policy if exists "messages insert" on messages;
drop policy if exists "messages delete" on messages;

create policy "messages read" on messages for select
  using (is_group_member(group_id));
create policy "messages insert" on messages for insert
  with check (sender_id = auth.uid() and is_group_member(group_id));
-- You can delete your own messages; the admin can delete anyone's in their circle.
create policy "messages delete" on messages for delete
  using (is_group_member(group_id) and (sender_id = auth.uid() or is_group_admin(group_id)));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
