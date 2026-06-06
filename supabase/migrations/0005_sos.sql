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
