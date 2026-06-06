-- ============================================================================
-- KidsGuard — app limits + focus schedules (Sommeil / Études).
-- Parent configures; child device enforces (AccessibilityService, native).
-- Transparent parental control — NOT content surveillance.
-- ============================================================================

alter table children
  add column if not exists study_enabled boolean not null default false,
  add column if not exists study_start time,
  add column if not exists study_end time,
  add column if not exists sleep_enabled boolean not null default false,
  add column if not exists sleep_start time,
  add column if not exists sleep_end time;

create table if not exists app_limits (
  child_id   uuid not null references children(id) on delete cascade,
  package    text not null,
  app_name   text not null,
  limit_min  int,                       -- daily limit in minutes (null = none)
  blocked    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (child_id, package)
);
alter table app_limits enable row level security;

drop policy if exists app_limits_parent on app_limits;
create policy app_limits_parent on app_limits
  for all using (owns_child(child_id)) with check (owns_child(child_id));

drop policy if exists app_limits_device_read on app_limits;
create policy app_limits_device_read on app_limits
  for select using (is_child_device(child_id));

-- ---- focus schedule --------------------------------------------------------
create or replace function set_focus(
  p_child uuid,
  p_study_enabled boolean, p_study_start time, p_study_end time,
  p_sleep_enabled boolean, p_sleep_start time, p_sleep_end time
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  update children set
    study_enabled = coalesce(p_study_enabled, false),
    study_start = p_study_start, study_end = p_study_end,
    sleep_enabled = coalesce(p_sleep_enabled, false),
    sleep_start = p_sleep_start, sleep_end = p_sleep_end
  where id = p_child;
end;
$$;

create or replace function get_focus(p_child uuid)
returns table (
  study_enabled boolean, study_start time, study_end time,
  sleep_enabled boolean, sleep_start time, sleep_end time
) language sql stable security definer set search_path = public as $$
  select c.study_enabled, c.study_start, c.study_end,
         c.sleep_enabled, c.sleep_start, c.sleep_end
  from children c where c.id = p_child and owns_child(p_child);
$$;

-- ---- per-app block / limit -------------------------------------------------
create or replace function set_app_limit(
  p_child uuid, p_package text, p_app_name text, p_limit int, p_blocked boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  insert into app_limits (child_id, package, app_name, limit_min, blocked, updated_at)
  values (p_child, p_package, p_app_name, p_limit, coalesce(p_blocked, false), now())
  on conflict (child_id, package)
  do update set app_name = excluded.app_name, limit_min = excluded.limit_min,
                blocked = excluded.blocked, updated_at = now();
end;
$$;

create or replace function list_app_limits(p_child uuid)
returns table (package text, app_name text, limit_min int, blocked boolean)
language sql stable security definer set search_path = public as $$
  select package, app_name, limit_min, blocked
  from app_limits where child_id = p_child and owns_child(p_child)
  order by app_name;
$$;

-- child device reads its own focus + limits (to enforce)
create or replace function my_focus()
returns table (
  child_id uuid,
  study_enabled boolean, study_start time, study_end time,
  sleep_enabled boolean, sleep_start time, sleep_end time
) language sql stable security definer set search_path = public as $$
  select c.id, c.study_enabled, c.study_start, c.study_end,
         c.sleep_enabled, c.sleep_start, c.sleep_end
  from children c where c.device_user_id = auth.uid();
$$;
