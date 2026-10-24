-- Phase one, step 5: availability status, silent mode, appear-offline.
-- Run AFTER 0001 to 0004. Safe to run more than once.

-- status:          what the circle sees next to your name.
-- status_until:    when the status ends by itself (null = until you change it).
-- silent_mode:     this person's phone makes no sound for voice clips or "Come for a sec".
-- appear_offline:  the green "online" dot is hidden from the circle (alerts still arrive).
-- sos_breakthrough: SOS still rings through every status and silent mode (default ON, on purpose).
alter table profiles add column if not exists status text not null default 'available';
alter table profiles add column if not exists status_until timestamptz;
alter table profiles add column if not exists silent_mode boolean not null default false;
alter table profiles add column if not exists appear_offline boolean not null default false;
alter table profiles add column if not exists sos_breakthrough boolean not null default true;

alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check
  check (status in ('available', 'meeting', 'sleeping', 'dnd'));
