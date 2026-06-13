-- ============================================================================
-- KidsGuard — automatic school mode. When enabled, the child's blocked apps
-- (Focus "Études") turn on automatically while the child is inside a school
-- zone, and off when they leave. "Set and forget" — no schedule to manage,
-- and it never blocks at home during school hours (location-driven).
-- ============================================================================

alter table children add column if not exists auto_school boolean not null default false;
alter table children add column if not exists at_school   boolean not null default false;

create or replace function get_auto_school(p_child uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auto_school from children where id = p_child and owns_child(p_child);
$$;

create or replace function set_auto_school(p_child uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  update children set auto_school = coalesce(p_on, false) where id = p_child;
  if not coalesce(p_on, false) then
    update children set at_school = false where id = p_child;
  end if;
end; $$;

-- Geofence trigger: also flip at_school when entering/leaving a school zone.
create or replace function fn_check_geofence()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_family uuid; v_auto boolean; pl record; inside boolean; last_dir geofence_dir;
begin
  select family_id, auto_school into v_family, v_auto from children where id = new.child_id;
  if v_family is null then return new; end if;

  for pl in select id, center, radius_m, kind from places where family_id = v_family loop
    inside := st_dwithin(new.geog, pl.center, pl.radius_m);
    select direction into last_dir from geofence_events
      where child_id = new.child_id and place_id = pl.id
      order by occurred_at desc limit 1;

    if inside and (last_dir is null or last_dir = 'exit') then
      insert into geofence_events (child_id, place_id, direction, occurred_at)
        values (new.child_id, pl.id, 'enter', new.recorded_at);
      if v_auto and pl.kind = 'school' then
        update children set at_school = true where id = new.child_id;
        perform push_child_sync(new.child_id);
      end if;
    elsif not inside and last_dir = 'enter' then
      insert into geofence_events (child_id, place_id, direction, occurred_at)
        values (new.child_id, pl.id, 'exit', new.recorded_at);
      if v_auto and pl.kind = 'school' then
        update children set at_school = false where id = new.child_id;
        perform push_child_sync(new.child_id);
      end if;
    end if;
  end loop;

  return new;
end; $$;
