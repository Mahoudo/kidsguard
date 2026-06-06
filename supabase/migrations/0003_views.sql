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
