-- Phase one, step 6: end-to-end encryption for voice clips and chat.
-- Run AFTER 0001 to 0005. Safe to run more than once.
--
-- How it works (the server never sees a readable message or recording):
--   * Every person's phone makes a private key that stays on the phone. Only the matching PUBLIC key is stored here.
--   * Every circle has one secret key. It is locked for each member with that member's public key (circle_keys),
--     so only that member's phone can open it.
--   * Voice and chat are encrypted on the sender's phone. The database only stores scrambled text.
--   * A copy of the private key, locked with a recovery code only the person knows, is kept in user_key_backups
--     so a new phone can restore it. Without the code nobody (not even the app owner) can open it.

-- ───────────── public keys (readable by people who share a circle with you) ─────────────
create table if not exists user_keys (
  user_id uuid primary key references profiles(id) on delete cascade,
  public_key text not null check (char_length(public_key) between 20 and 400),
  created_at timestamptz not null default now()
);
alter table user_keys enable row level security;
drop policy if exists "user_keys read" on user_keys;
drop policy if exists "user_keys insert" on user_keys;
drop policy if exists "user_keys update" on user_keys;
drop policy if exists "user_keys delete" on user_keys;
create policy "user_keys read" on user_keys for select
  using (user_id = auth.uid() or shares_group_with(user_id));
create policy "user_keys insert" on user_keys for insert with check (user_id = auth.uid());
create policy "user_keys update" on user_keys for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_keys delete" on user_keys for delete using (user_id = auth.uid());

-- ───────────── private-key backup (only ever readable by its owner, and locked by the recovery code) ─────────────
create table if not exists user_key_backups (
  user_id uuid primary key references profiles(id) on delete cascade,
  salt text not null,
  iv text not null,
  ciphertext text not null check (char_length(ciphertext) <= 4000),
  created_at timestamptz not null default now()
);
alter table user_key_backups enable row level security;
drop policy if exists "backup own" on user_key_backups;
create policy "backup own" on user_key_backups for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── the circle key, locked once per member ─────────────
alter table family_groups add column if not exists key_version int not null default 0;
alter table family_groups add column if not exists key_needs_rotation boolean not null default false;

create table if not exists circle_keys (
  group_id uuid not null references family_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  version int not null check (version >= 1),
  wrapped text not null check (char_length(wrapped) <= 1000),
  eph_pub text not null check (char_length(eph_pub) <= 400),
  wrapped_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id, version)
);
alter table circle_keys enable row level security;
drop policy if exists "circle_keys read own" on circle_keys;
drop policy if exists "circle_keys insert" on circle_keys;
drop policy if exists "circle_keys delete own" on circle_keys;
create policy "circle_keys read own" on circle_keys for select using (user_id = auth.uid());
-- A member may lock the CURRENT circle key for another member of the same circle.
create policy "circle_keys insert" on circle_keys for insert
  with check (
    wrapped_by = auth.uid()
    and is_group_member(group_id)
    and exists (select 1 from family_members fm where fm.group_id = circle_keys.group_id and fm.user_id = circle_keys.user_id)
    and exists (select 1 from family_groups g where g.id = circle_keys.group_id and g.key_version = circle_keys.version)
  );
create policy "circle_keys delete own" on circle_keys for delete using (user_id = auth.uid());

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'circle_keys') then
    alter publication supabase_realtime add table circle_keys;
  end if;
exception when others then raise notice 'realtime publication skipped: %', sqlerrm;
end $$;

-- Who already holds the key for a version (so a member can lock it for the ones who do not).
create or replace function circle_key_holders(p_group uuid, p_version int)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not is_group_member(p_group) then raise exception 'Not a member'; end if;
  return query select user_id from circle_keys where group_id = p_group and version = p_version;
end $$;

-- The first member to call this when no key exists yet wins the right to create it.
create or replace function start_circle_key(p_group uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_group_member(p_group) then raise exception 'Not a member'; end if;
  update family_groups set key_version = 1 where id = p_group and key_version = 0;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- After someone left or was removed, a member holding the key starts a new one. Only one caller wins.
create or replace function rotate_circle_key(p_group uuid, p_expected int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not is_group_member(p_group) then raise exception 'Not a member'; end if;
  update family_groups set key_version = key_version + 1, key_needs_rotation = false
   where id = p_group and key_version = p_expected and key_version >= 1
   returning key_version into v;
  return v;   -- null = somebody else already did it
end $$;

-- When a member leaves or is removed: forget their locked keys and ask for a fresh circle key.
create or replace function circle_keys_on_member_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from circle_keys where group_id = old.group_id and user_id = old.user_id;
  update family_groups set key_needs_rotation = true where id = old.group_id and key_version >= 1;
  return old;
end $$;
drop trigger if exists circle_keys_member_removed on family_members;
create trigger circle_keys_member_removed after delete on family_members
  for each row execute function circle_keys_on_member_removed();

revoke all on function circle_keys_on_member_removed() from public, anon, authenticated;
revoke all on function circle_key_holders(uuid, int) from public, anon;
revoke all on function start_circle_key(uuid) from public, anon;
revoke all on function rotate_circle_key(uuid, int) from public, anon;
grant execute on function circle_key_holders(uuid, int) to authenticated;
grant execute on function start_circle_key(uuid) to authenticated;
grant execute on function rotate_circle_key(uuid, int) to authenticated;

-- ───────────── encrypted content columns ─────────────
-- iv = random value used for this one message; key_version = which circle key locked it.
alter table messages add column if not exists iv text;
alter table messages add column if not exists key_version int;
alter table messages drop constraint if exists messages_body_check;
alter table messages add constraint messages_body_check check (char_length(body) between 1 and 8000);

alter table voice_clips add column if not exists iv text;
alter table voice_clips add column if not exists key_version int;

-- From now on the server refuses anything that is not encrypted (older rows are left as they were).
alter table messages drop constraint if exists messages_must_be_encrypted;
alter table messages add constraint messages_must_be_encrypted
  check (iv is not null and key_version is not null) not valid;
alter table voice_clips drop constraint if exists voice_must_be_encrypted;
alter table voice_clips add constraint voice_must_be_encrypted
  check (iv is not null and key_version is not null) not valid;

-- ───────────── clean up expired voice clips on a schedule ─────────────
-- (Expired clips were already invisible; this also removes them from the table even when nobody sends a new one.)
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'famitie-purge-voice';
  perform cron.schedule('famitie-purge-voice', '*/10 * * * *', 'select public.purge_expired_voice()');
exception when others then
  raise notice 'pg_cron not available (%): enable it under Database > Extensions to schedule the purge', sqlerrm;
end $$;
