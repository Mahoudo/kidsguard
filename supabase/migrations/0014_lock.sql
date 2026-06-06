-- ============================================================================
-- KidsGuard — remote lock. Parent can lock/unlock the child device.
-- Legit parental control (not surveillance).
-- ============================================================================

alter table children add column if not exists locked boolean not null default false;

-- Parent: lock or unlock a child device.
create or replace function set_child_lock(p_child uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  update children set locked = coalesce(p_locked, false) where id = p_child;
end;
$$;

-- Realtime so the child device reacts immediately to lock/unlock.
alter publication supabase_realtime add table public.children;

-- Expose lock state to the parent dashboard.
create or replace function children_overview()
returns table (
  id uuid, name text, avatar_url text, pairing_code text,
  last_battery_pct int, last_seen_at timestamptz,
  lng double precision, lat double precision, accuracy_m real, located_at timestamptz,
  locked boolean
) language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.avatar_url, c.pairing_code, c.last_battery_pct, c.last_seen_at,
         st_x(l.geog::geometry), st_y(l.geog::geometry), l.accuracy_m, l.recorded_at, c.locked
  from children c
  join family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
  left join lateral (
    select geog, accuracy_m, recorded_at from locations
    where child_id = c.id order by recorded_at desc limit 1
  ) l on true
  order by c.created_at;
$$;
