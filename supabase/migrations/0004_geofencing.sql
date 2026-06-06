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
