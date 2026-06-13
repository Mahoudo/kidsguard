-- ============================================================================
-- KidsGuard — SECURITY hardening of child-device RPCs (audit H1/H5/H2).
-- A paired device can no longer pollute data with implausible jumps or spam.
-- ============================================================================

-- ingest_location: reject out-of-range coords + physically impossible jumps
-- (>1000 km/h vs the previous fix). Older (replayed-offline) points pass through.
create or replace function ingest_location(
  p_child uuid, p_lng double precision, p_lat double precision,
  p_accuracy real default null, p_battery int default null,
  p_is_moving boolean default null, p_recorded_at timestamptz default now()
) returns void language plpgsql security definer set search_path = public as $$
declare v_last_geog geography; v_last_at timestamptz; v_dt double precision; v_new geography;
begin
  if not is_child_device(p_child) then raise exception 'not this device''s child'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return; end if;

  v_new := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  select geog, recorded_at into v_last_geog, v_last_at
  from locations where child_id = p_child order by recorded_at desc limit 1;

  -- Only check forward-in-time points; drop ones implying > ~280 m/s (1000 km/h).
  if v_last_geog is not null and p_recorded_at > v_last_at then
    v_dt := extract(epoch from (p_recorded_at - v_last_at));
    if v_dt > 0 and st_distance(v_new, v_last_geog) / v_dt > 280 then
      return; -- implausible jump, silently dropped
    end if;
  end if;

  insert into locations (child_id, geog, accuracy_m, battery_pct, is_moving, recorded_at)
  values (p_child, v_new, p_accuracy, p_battery, p_is_moving, p_recorded_at);

  update children
  set last_battery_pct = coalesce(p_battery, last_battery_pct),
      last_seen_at = greatest(coalesce(last_seen_at, p_recorded_at), p_recorded_at)
  where id = p_child;
end; $$;

-- raise_sos: collapse duplicate SOS within 15s (anti-spam) — never reject a
-- real SOS, just dedupe. Returns the existing alert id if one is in flight.
create or replace function raise_sos(
  p_child uuid, p_lng double precision, p_lat double precision, p_battery int default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_existing uuid;
begin
  if not is_child_device(p_child) then raise exception 'not this device''s child'; end if;

  select id into v_existing from sos_alerts
  where child_id = p_child and resolved_at is null and created_at > now() - interval '15 seconds'
  order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into sos_alerts (child_id, geog, battery_pct)
  values (p_child, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_battery)
  returning id into v_id;
  return v_id;
end; $$;

-- request_pause: throttle — collapse to the existing pending request if one was
-- made in the last 2 minutes (anti notification-spam).
create or replace function request_pause(p_child uuid, p_minutes int default 15)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; cname text; v_existing uuid;
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;

  select id into v_existing from pause_requests
  where child_id = p_child and status = 'pending' and created_at > now() - interval '2 minutes'
  order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into pause_requests(child_id, minutes)
  values (p_child, greatest(5, least(120, coalesce(p_minutes, 15)))) returning id into rid;
  select name into cname from children where id = p_child;
  perform send_expo_push(
    owner_push_token(p_child), '⏸️ Demande de pause',
    coalesce(cname, 'Ton enfant') || ' demande une pause de ' ||
      greatest(5, least(120, coalesce(p_minutes, 15))) || ' min.',
    jsonb_build_object('type', 'pause_request', 'child_id', p_child, 'request_id', rid));
  return rid;
end; $$;
