-- FamiTie: phase one schema
-- Scope: family circles, SOS / "come for a sec" alerts, location sharing, device push tokens.
-- Deferred (not in this migration): live listening / consent agreements, walkie-talkie transcripts.

create extension if not exists "pgcrypto";

-- ───────────── Enums ─────────────
create type member_role as enum ('elder', 'responder', 'admin');
create type alert_type as enum ('sos', 'come_for_a_sec');
create type alert_status as enum ('ringing', 'answered', 'missed', 'cancelled');
create type device_platform as enum ('ios', 'android', 'watchos', 'wearos');

-- ───────────── Profiles ─────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ───────────── Family circles ─────────────
create table family_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table family_members (
  group_id uuid not null references family_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null default 'responder',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on family_members (user_id);

-- ───────────── Alerts (SOS + come for a sec) ─────────────
create table alerts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references family_groups(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  type alert_type not null,
  status alert_status not null default 'ringing',
  lat double precision,
  lng double precision,
  accuracy_m real,
  answered_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index on alerts (group_id, created_at desc);

-- ───────────── Location sharing ─────────────
-- Latest position per user (upserted). Only meaningful while sharing_enabled = true.
create table locations (
  user_id uuid primary key references profiles(id) on delete cascade,
  sharing_enabled boolean not null default false,
  lat double precision,
  lng double precision,
  accuracy_m real,
  battery_pct smallint,
  updated_at timestamptz not null default now()
);

-- Optional trail. Purge old rows with a scheduled job (e.g. keep 7-30 days).
create table location_history (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  recorded_at timestamptz not null default now()
);
create index on location_history (user_id, recorded_at desc);

-- ───────────── Device push tokens ─────────────
create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform device_platform not null,
  token text not null,
  is_voip boolean not null default false,  -- iOS PushKit token
  updated_at timestamptz not null default now(),
  unique (user_id, platform, token)
);

-- ───────────── Helper: membership check ─────────────
create or replace function is_group_member(gid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from family_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function shares_group_with(uid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from family_members a
    join family_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

-- ───────────── Row Level Security ─────────────
alter table profiles enable row level security;
alter table family_groups enable row level security;
alter table family_members enable row level security;
alter table alerts enable row level security;
alter table locations enable row level security;
alter table location_history enable row level security;
alter table device_tokens enable row level security;

-- profiles: see yourself and people in your circles; edit only yourself
create policy "profiles read" on profiles for select
  using (id = auth.uid() or shares_group_with(id));
create policy "profiles insert self" on profiles for insert
  with check (id = auth.uid());
create policy "profiles update self" on profiles for update
  using (id = auth.uid());

-- family_groups: members read; creator inserts
create policy "groups read" on family_groups for select
  using (is_group_member(id));
create policy "groups insert" on family_groups for insert
  with check (created_by = auth.uid());

-- family_members: see co-members; join happens via an invite-code RPC (add later)
create policy "members read" on family_members for select
  using (is_group_member(group_id));
create policy "members insert self as creator" on family_members for insert
  with check (user_id = auth.uid());
create policy "members leave" on family_members for delete
  using (user_id = auth.uid());

-- alerts: members read; only the sender creates; any member can answer
create policy "alerts read" on alerts for select
  using (is_group_member(group_id));
create policy "alerts insert" on alerts for insert
  with check (sender_id = auth.uid() and is_group_member(group_id));
create policy "alerts answer" on alerts for update
  using (is_group_member(group_id));

-- locations: owner writes; circle members read ONLY while sharing is enabled
create policy "locations owner write" on locations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "locations circle read" on locations for select
  using (sharing_enabled and shares_group_with(user_id));

create policy "history owner write" on location_history for insert
  with check (user_id = auth.uid());
create policy "history circle read" on location_history for select
  using (user_id = auth.uid() or shares_group_with(user_id));

-- device_tokens: strictly private (push is sent server-side with the service role)
create policy "tokens owner only" on device_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table locations;
