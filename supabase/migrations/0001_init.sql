-- ============================================================================
-- KidsGuard — initial schema
-- Parental safety app (geolocation + geofencing + SOS). MVP.
-- ============================================================================

create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type place_kind   as enum ('home', 'school', 'other');
create type geofence_dir as enum ('enter', 'exit');
create type command_type as enum ('ring', 'locate_now', 'stop_ring');
create type command_status as enum ('pending', 'acked', 'done', 'expired');

-- ----------------------------------------------------------------------------
-- profiles : 1-1 with auth.users (the PARENT account)
-- ----------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- auto-create a profile row on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- families : owned by one parent (multi-parent = later via family_members)
-- ----------------------------------------------------------------------------
create table families (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references profiles(id) on delete cascade,
  name        text not null default 'Ma famille',
  created_at  timestamptz not null default now()
);
create index families_owner_idx on families(owner_id);

-- ----------------------------------------------------------------------------
-- children : a tracked child. Child device authenticates as an ANONYMOUS
-- auth user (device_user_id), bound at pairing time via the 6-digit code.
-- ----------------------------------------------------------------------------
create table children (
  id             uuid primary key default uuid_generate_v4(),
  family_id      uuid not null references families(id) on delete cascade,
  name           text not null,
  avatar_url     text,
  birth_date     date,
  -- pairing
  pairing_code   text unique,                 -- null once paired
  pairing_expires_at timestamptz,
  device_user_id uuid references auth.users(id) on delete set null, -- child's anon session
  paired_at      timestamptz,
  -- last known telemetry (denormalized for fast dashboard reads)
  last_battery_pct  int,
  last_seen_at      timestamptz,
  created_at     timestamptz not null default now()
);
create index children_family_idx on children(family_id);
create index children_device_idx on children(device_user_id);

-- ----------------------------------------------------------------------------
-- locations : append-only GPS pings from the child device
-- ----------------------------------------------------------------------------
create table locations (
  id           bigserial primary key,
  child_id     uuid not null references children(id) on delete cascade,
  geog         geography(Point, 4326) not null,
  accuracy_m   real,
  battery_pct  int,
  is_moving    boolean,
  recorded_at  timestamptz not null,          -- device clock
  created_at   timestamptz not null default now()
);
create index locations_child_time_idx on locations(child_id, recorded_at desc);
create index locations_geog_idx on locations using gist(geog);

-- ----------------------------------------------------------------------------
-- places : geofenced zones (school, home...)
-- ----------------------------------------------------------------------------
create table places (
  id          uuid primary key default uuid_generate_v4(),
  family_id   uuid not null references families(id) on delete cascade,
  name        text not null,
  kind        place_kind not null default 'other',
  center      geography(Point, 4326) not null,
  radius_m    int not null default 150 check (radius_m between 50 and 5000),
  created_at  timestamptz not null default now()
);
create index places_family_idx on places(family_id);
create index places_geog_idx on places using gist(center);

-- ----------------------------------------------------------------------------
-- geofence_events : enter/exit transitions (computed server-side)
-- ----------------------------------------------------------------------------
create table geofence_events (
  id          bigserial primary key,
  child_id    uuid not null references children(id) on delete cascade,
  place_id    uuid not null references places(id) on delete cascade,
  direction   geofence_dir not null,
  occurred_at timestamptz not null default now()
);
create index geofence_child_time_idx on geofence_events(child_id, occurred_at desc);

-- ----------------------------------------------------------------------------
-- commands : parent -> child (ring, locate now...). Child polls / realtime.
-- ----------------------------------------------------------------------------
create table commands (
  id          uuid primary key default uuid_generate_v4(),
  child_id    uuid not null references children(id) on delete cascade,
  type        command_type not null,
  status      command_status not null default 'pending',
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index commands_child_status_idx on commands(child_id, status);

-- ----------------------------------------------------------------------------
-- sos_alerts : child panic button
-- ----------------------------------------------------------------------------
create table sos_alerts (
  id          uuid primary key default uuid_generate_v4(),
  child_id    uuid not null references children(id) on delete cascade,
  geog        geography(Point, 4326),
  battery_pct int,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index sos_child_idx on sos_alerts(child_id, created_at desc);
