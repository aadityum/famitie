-- Phase one, step 4: personal timers, saved voice clips that expire, and account deletion.
-- Run AFTER 0001, 0002 and 0003. Safe to run more than once.

-- ───────────── Personal settings (kept on the profile, so they follow the person across devices) ─────────────
-- alert_visible_minutes: how long an answered alert stays visible on this person's screen (1 minute to 24 hours).
-- voice_keep_minutes:    how long this person's voice recordings are kept before they disappear (1 minute to 6 hours).
alter table profiles add column if not exists alert_visible_minutes int not null default 60;
alter table profiles add column if not exists voice_keep_minutes int not null default 30;

alter table profiles drop constraint if exists profiles_alert_visible_check;
alter table profiles add constraint profiles_alert_visible_check check (alert_visible_minutes between 1 and 1440);
alter table profiles drop constraint if exists profiles_voice_keep_check;
alter table profiles add constraint profiles_voice_keep_check check (voice_keep_minutes between 1 and 360);

-- Editing your own profile must not let you change which account it belongs to.
drop policy if exists "profiles update self" on profiles;
create policy "profiles update self" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ───────────── Saved voice clips (expire automatically) ─────────────
-- Clips are still delivered instantly over the live channel. This table lets people who were offline
-- or opened the app later hear them, until they expire. The server stamps the expiry from the
-- SENDER's setting, so a modified app cannot keep recordings longer than the person chose.
create table if not exists voice_clips (
  id uuid primary key,
  group_id uuid not null references family_groups(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  seconds smallint not null check (seconds between 1 and 20),
  mime text not null check (char_length(mime) <= 100),
  audio text not null check (char_length(audio) between 1 and 400000),  -- base64
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()
);
create index if not exists voice_clips_group_created on voice_clips (group_id, created_at desc);
create index if not exists voice_clips_expires on voice_clips (expires_at);

alter table voice_clips enable row level security;
drop policy if exists "voice read" on voice_clips;
drop policy if exists "voice insert" on voice_clips;
drop policy if exists "voice delete" on voice_clips;
create policy "voice read" on voice_clips for select
  using (is_group_member(group_id) and expires_at > now());
create policy "voice insert" on voice_clips for insert
  with check (sender_id = auth.uid() and is_group_member(group_id));
create policy "voice delete" on voice_clips for delete
  using (sender_id = auth.uid());

create or replace function voice_clips_stamp_expiry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  new.expires_at := now() + make_interval(mins => coalesce(
    (select voice_keep_minutes from profiles where id = new.sender_id), 30));
  return new;
end $$;

drop trigger if exists voice_clips_stamp on voice_clips;
create trigger voice_clips_stamp before insert on voice_clips
  for each row execute function voice_clips_stamp_expiry();

-- Expired rows are invisible straight away (see the read policy) and physically deleted here.
-- This runs after every new clip. You can also schedule it (Supabase: Database > Cron) if you like.
create or replace function purge_expired_voice()
returns void language sql security definer set search_path = public as $$
  delete from voice_clips where expires_at < now();
$$;

create or replace function voice_clips_purge_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform purge_expired_voice();
  return null;
end $$;

drop trigger if exists voice_clips_purge on voice_clips;
create trigger voice_clips_purge after insert on voice_clips
  for each statement execute function voice_clips_purge_trigger();

revoke all on function purge_expired_voice() from public, anon, authenticated;
revoke all on function voice_clips_stamp_expiry() from public, anon, authenticated;
revoke all on function voice_clips_purge_trigger() from public, anon, authenticated;

-- ───────────── Let an account be deleted ─────────────
-- These links used to block deleting a person who had created a circle, sent an alert, or answered one.
alter table family_groups alter column created_by drop not null;
alter table family_groups drop constraint if exists family_groups_created_by_fkey;
alter table family_groups add constraint family_groups_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table alerts drop constraint if exists alerts_sender_id_fkey;
alter table alerts add constraint alerts_sender_id_fkey
  foreign key (sender_id) references profiles(id) on delete cascade;

alter table alerts drop constraint if exists alerts_answered_by_fkey;
alter table alerts add constraint alerts_answered_by_fkey
  foreign key (answered_by) references profiles(id) on delete set null;

-- Leaving logic now lives in one internal function used by both "Leave circle" and "Delete account",
-- so an admin who deletes their account hands admin on exactly like an admin who leaves.
create or replace function leave_circle_internal(p_uid uuid, p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare was_admin boolean; next_admin uuid;
begin
  select is_admin into was_admin from family_members
   where group_id = p_group and user_id = p_uid;
  if not found then raise exception 'You are not in this circle'; end if;

  delete from family_members where group_id = p_group and user_id = p_uid;

  if was_admin then
    select user_id into next_admin from family_members
     where group_id = p_group
     order by (role = 'elder'), joined_at, user_id
     limit 1;

    if next_admin is null then
      delete from family_groups where id = p_group;
    else
      update family_members set is_admin = true where group_id = p_group and user_id = next_admin;
    end if;
  end if;
end $$;

-- It takes a user id, so nobody but the database itself may call it.
revoke all on function leave_circle_internal(uuid, uuid) from public, anon, authenticated;

create or replace function leave_family_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform leave_circle_internal(auth.uid(), p_group);
end $$;

-- Deletes the signed-in person's account and everything of theirs: profile, messages, voice clips,
-- alerts they sent, shared location and push tokens. Circles they were in carry on without them.
create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  for g in select group_id from family_members where user_id = auth.uid() loop
    perform leave_circle_internal(auth.uid(), g);
  end loop;

  delete from auth.users where id = auth.uid();   -- cascades to the profile and all their data
end $$;

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
revoke all on function leave_family_group(uuid) from public, anon;
grant execute on function leave_family_group(uuid) to authenticated;
