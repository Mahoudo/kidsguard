-- KidsGuard — bundle migrations 0001-0005 (paste dans Supabase SQL Editor)

-- ======== supabase/migrations/0001_init.sql ========
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

-- ======== supabase/migrations/0002_rls_and_rpc.sql ========
-- ============================================================================
-- KidsGuard — Row Level Security + pairing RPCs
-- Two actor types share auth.users:
--   PARENT  : normal signed-in user, owns families/children
--   CHILD   : anonymous auth user, bound to ONE child row (device_user_id)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper predicates (security definer to read across tables in policies)
-- ----------------------------------------------------------------------------

-- true if current user is the PARENT that owns this child
create or replace function owns_child(p_child uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from children c
    join families f on f.id = c.family_id
    where c.id = p_child and f.owner_id = auth.uid()
  );
$$;

-- true if current user is the CHILD device bound to this child row
create or replace function is_child_device(p_child uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from children c
    where c.id = p_child and c.device_user_id = auth.uid()
  );
$$;

-- true if current user owns this family
create or replace function owns_family(p_family uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from families f
    where f.id = p_family and f.owner_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere
-- ----------------------------------------------------------------------------
alter table profiles        enable row level security;
alter table families        enable row level security;
alter table children        enable row level security;
alter table locations       enable row level security;
alter table places          enable row level security;
alter table geofence_events enable row level security;
alter table commands        enable row level security;
alter table sos_alerts      enable row level security;

-- profiles : self only
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- families : owner only
create policy families_owner on families
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- children : parent full access; child device can read its own row
create policy children_parent on children
  for all using (owns_family(family_id)) with check (owns_family(family_id));
create policy children_device_read on children
  for select using (device_user_id = auth.uid());

-- locations : child device inserts its own; parent reads
create policy locations_device_insert on locations
  for insert with check (is_child_device(child_id));
create policy locations_parent_read on locations
  for select using (owns_child(child_id));

-- places : parent only; child device can read (needed to evaluate geofence locally if desired)
create policy places_parent on places
  for all using (owns_family(family_id)) with check (owns_family(family_id));

-- geofence_events : parent reads (server/edge writes via service role, bypasses RLS)
create policy geofence_parent_read on geofence_events
  for select using (owns_child(child_id));

-- commands : parent creates/reads; child device reads + updates status of its own
create policy commands_parent on commands
  for all using (owns_child(child_id)) with check (owns_child(child_id));
create policy commands_device_read on commands
  for select using (is_child_device(child_id));
create policy commands_device_update on commands
  for update using (is_child_device(child_id)) with check (is_child_device(child_id));

-- sos_alerts : child device inserts; parent reads + resolves
create policy sos_device_insert on sos_alerts
  for insert with check (is_child_device(child_id));
create policy sos_parent on sos_alerts
  for select using (owns_child(child_id));
create policy sos_parent_resolve on sos_alerts
  for update using (owns_child(child_id)) with check (owns_child(child_id));

-- ============================================================================
-- RPCs
-- ============================================================================

-- Parent: create a child + generate a 6-digit pairing code (valid 30 min)
create or replace function create_child(p_family uuid, p_name text, p_avatar text default null)
returns children language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_child children;
begin
  if not owns_family(p_family) then
    raise exception 'not authorized for this family';
  end if;

  -- 6-digit code, retry on collision
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from children where pairing_code = v_code);
  end loop;

  insert into children (family_id, name, avatar_url, pairing_code, pairing_expires_at)
  values (p_family, p_name, p_avatar, v_code, now() + interval '30 minutes')
  returning * into v_child;

  return v_child;
end;
$$;

-- Child device (anonymous user): redeem a pairing code -> bind this device
-- Returns the child id on success.
create or replace function pair_device(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_child children;
begin
  select * into v_child from children
  where pairing_code = p_code
    and pairing_expires_at > now()
    and device_user_id is null
  for update;

  if not found then
    raise exception 'invalid or expired pairing code';
  end if;

  update children
  set device_user_id = auth.uid(),
      pairing_code = null,
      pairing_expires_at = null,
      paired_at = now()
  where id = v_child.id;

  return v_child.id;
end;
$$;

-- Child device: push a location ping + update denormalized last_* fields
create or replace function ingest_location(
  p_child uuid, p_lng double precision, p_lat double precision,
  p_accuracy real default null, p_battery int default null,
  p_is_moving boolean default null, p_recorded_at timestamptz default now()
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then
    raise exception 'not this device''s child';
  end if;

  insert into locations (child_id, geog, accuracy_m, battery_pct, is_moving, recorded_at)
  values (p_child, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
          p_accuracy, p_battery, p_is_moving, p_recorded_at);

  update children
  set last_battery_pct = coalesce(p_battery, last_battery_pct),
      last_seen_at = greatest(coalesce(last_seen_at, p_recorded_at), p_recorded_at)
  where id = p_child;
end;
$$;

-- ======== supabase/migrations/0003_views.sql ========
-- ============================================================================
-- KidsGuard — read helpers (decode PostGIS geography to lng/lat for clients)
-- PostgREST returns geography as WKB hex, so expose decoded coords via RPCs.
-- ============================================================================

-- Children of the current parent + their latest known location.
create or replace function children_overview()
returns table (
  id              uuid,
  name            text,
  avatar_url      text,
  pairing_code    text,
  last_battery_pct int,
  last_seen_at    timestamptz,
  lng             double precision,
  lat             double precision,
  accuracy_m      real,
  located_at      timestamptz
) language sql stable security definer set search_path = public as $$
  select
    c.id, c.name, c.avatar_url, c.pairing_code, c.last_battery_pct, c.last_seen_at,
    st_x(l.geog::geometry), st_y(l.geog::geometry), l.accuracy_m, l.recorded_at
  from children c
  join families f on f.id = c.family_id and f.owner_id = auth.uid()
  left join lateral (
    select geog, accuracy_m, recorded_at
    from locations
    where child_id = c.id
    order by recorded_at desc
    limit 1
  ) l on true
  order by c.created_at;
$$;

-- Location history for one child (parent-owned), newest first.
create or replace function child_track(p_child uuid, p_limit int default 100)
returns table (
  lng double precision,
  lat double precision,
  accuracy_m real,
  recorded_at timestamptz
) language sql stable security definer set search_path = public as $$
  select st_x(geog::geometry), st_y(geog::geometry), accuracy_m, recorded_at
  from locations
  where child_id = p_child and owns_child(p_child)
  order by recorded_at desc
  limit greatest(1, least(p_limit, 1000));
$$;

-- ======== supabase/migrations/0004_geofencing.sql ========
-- ============================================================================
-- KidsGuard — geofencing engine
-- On each new location, detect enter/exit transitions vs the family's places
-- and append geofence_events. Pure DB trigger (no edge function for MVP).
-- ============================================================================

create or replace function fn_check_geofence()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_family uuid;
  pl       record;
  inside   boolean;
  last_dir geofence_dir;
begin
  select family_id into v_family from children where id = new.child_id;
  if v_family is null then
    return new;
  end if;

  for pl in
    select id, center, radius_m from places where family_id = v_family
  loop
    inside := st_dwithin(new.geog, pl.center, pl.radius_m);

    select direction into last_dir
    from geofence_events
    where child_id = new.child_id and place_id = pl.id
    order by occurred_at desc
    limit 1;

    if inside and (last_dir is null or last_dir = 'exit') then
      insert into geofence_events (child_id, place_id, direction, occurred_at)
      values (new.child_id, pl.id, 'enter', new.recorded_at);
    elsif not inside and last_dir = 'enter' then
      insert into geofence_events (child_id, place_id, direction, occurred_at)
      values (new.child_id, pl.id, 'exit', new.recorded_at);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_geofence on locations;
create trigger trg_geofence
  after insert on locations
  for each row execute function fn_check_geofence();

-- ----------------------------------------------------------------------------
-- Parent RPCs (decode geography to lng/lat)
-- ----------------------------------------------------------------------------

create or replace function create_place(
  p_family uuid, p_name text, p_kind place_kind,
  p_lng double precision, p_lat double precision, p_radius int
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not owns_family(p_family) then
    raise exception 'not authorized for this family';
  end if;
  insert into places (family_id, name, kind, center, radius_m)
  values (
    p_family, p_name, p_kind,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    greatest(50, least(p_radius, 5000))
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function places_overview()
returns table (
  id uuid, name text, kind place_kind,
  lng double precision, lat double precision, radius_m int
) language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.kind,
         st_x(p.center::geometry), st_y(p.center::geometry), p.radius_m
  from places p
  join families f on f.id = p.family_id and f.owner_id = auth.uid()
  order by p.created_at;
$$;

create or replace function geofence_feed(p_limit int default 50)
returns table (
  id bigint, child_id uuid, child_name text,
  place_name text, direction geofence_dir, occurred_at timestamptz
) language sql stable security definer set search_path = public as $$
  select e.id, e.child_id, c.name, p.name, e.direction, e.occurred_at
  from geofence_events e
  join children c on c.id = e.child_id
  join places   p on p.id = e.place_id
  join families f on f.id = c.family_id and f.owner_id = auth.uid()
  order by e.occurred_at desc
  limit greatest(1, least(p_limit, 200));
$$;

-- ======== supabase/migrations/0005_sos.sql ========
-- ============================================================================
-- KidsGuard — SOS RPCs (child raises, parent reads/resolves)
-- ============================================================================

-- Child device: raise an SOS with current position.
create or replace function raise_sos(
  p_child uuid, p_lng double precision, p_lat double precision,
  p_battery int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_child_device(p_child) then
    raise exception 'not this device''s child';
  end if;
  insert into sos_alerts (child_id, geog, battery_pct)
  values (
    p_child,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_battery
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Parent: SOS feed with decoded coords.
create or replace function sos_feed(p_limit int default 50)
returns table (
  id uuid, child_id uuid, child_name text,
  lng double precision, lat double precision,
  battery_pct int, created_at timestamptz, resolved_at timestamptz
) language sql stable security definer set search_path = public as $$
  select s.id, s.child_id, c.name,
         st_x(s.geog::geometry), st_y(s.geog::geometry),
         s.battery_pct, s.created_at, s.resolved_at
  from sos_alerts s
  join children c on c.id = s.child_id
  join families f on f.id = c.family_id and f.owner_id = auth.uid()
  order by s.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;

-- Parent: mark an SOS resolved.
create or replace function resolve_sos(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update sos_alerts s
  set resolved_at = now()
  from children c, families f
  where s.id = p_id
    and c.id = s.child_id
    and f.id = c.family_id
    and f.owner_id = auth.uid();
end;
$$;
