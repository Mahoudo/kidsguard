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
