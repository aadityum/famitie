-- Phase one, step 2: sign-up, joining circles, and private realtime channels.
-- Run AFTER 0001_initial_schema.sql.

-- ───────────── Auto-create a profile for every new account ─────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ───────────── Close the "anyone can add themselves to any group" hole ─────────────
-- Joining now goes only through join_family_group(), which requires the invite code.
drop policy if exists "members insert self as creator" on family_members;
drop policy if exists "groups insert" on family_groups;

-- ───────────── Create / join a circle ─────────────
create or replace function create_family_group(p_name text, p_role member_role default 'responder')
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Circle name is required'; end if;

  insert into family_groups (name, created_by) values (trim(p_name), auth.uid())
  returning id into gid;

  insert into family_members (group_id, user_id, role) values (gid, auth.uid(), p_role);
  return gid;
end $$;

create or replace function join_family_group(p_code text, p_role member_role default 'responder')
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select id into gid from family_groups where invite_code = lower(trim(p_code));
  if gid is null then raise exception 'Invalid invite code'; end if;

  insert into family_members (group_id, user_id, role) values (gid, auth.uid(), p_role)
  on conflict (group_id, user_id) do update set role = excluded.role;
  return gid;
end $$;

revoke all on function create_family_group(text, member_role) from public;
revoke all on function join_family_group(text, member_role) from public;
grant execute on function create_family_group(text, member_role) to authenticated;
grant execute on function join_family_group(text, member_role) to authenticated;

-- ───────────── Private realtime channels ─────────────
-- The app uses channels named  group:<group uuid>  for presence and voice clips.
-- Only members of that group may listen or send.
drop policy if exists "group channel read" on realtime.messages;
drop policy if exists "group channel write" on realtime.messages;

create policy "group channel read" on realtime.messages
  for select to authenticated
  using (
    case when realtime.topic() ~ '^group:[0-9a-f-]{36}$'
      then is_group_member(substr(realtime.topic(), 7)::uuid)
      else false end
  );

create policy "group channel write" on realtime.messages
  for insert to authenticated
  with check (
    case when realtime.topic() ~ '^group:[0-9a-f-]{36}$'
      then is_group_member(substr(realtime.topic(), 7)::uuid)
      else false end
  );

-- ───────────── Safer helper functions (fixed search_path) ─────────────
create or replace function is_group_member(gid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from family_members where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function shares_group_with(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from family_members a
    join family_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

-- ───────────── Alerts: answering goes through one narrow function ─────────────
-- Members can no longer edit alert rows directly (e.g. change coordinates).
drop policy if exists "alerts answer" on alerts;

create or replace function answer_alert(p_alert uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update alerts
     set status = 'answered', answered_by = auth.uid(), answered_at = now()
   where id = p_alert
     and status = 'ringing'
     and sender_id <> auth.uid()
     and is_group_member(group_id);
end $$;

revoke all on function answer_alert(uuid) from public;
grant execute on function answer_alert(uuid) to authenticated;

-- ───────────── Locations: let "sharing turned off" reach other devices live ─────────────
-- Realtime only delivers changes for rows the viewer may read. The row now stays readable
-- to the circle, but coordinates are always NULL when sharing is off (enforced below),
-- so nothing private is exposed and family screens clear the pin immediately.
drop policy if exists "locations circle read" on locations;
create policy "locations circle read" on locations for select
  using (user_id = auth.uid() or shares_group_with(user_id));

alter table locations drop constraint if exists locations_off_has_no_coords;
alter table locations add constraint locations_off_has_no_coords
  check (sharing_enabled or (lat is null and lng is null));
