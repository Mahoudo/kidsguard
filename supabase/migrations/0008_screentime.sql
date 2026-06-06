-- ============================================================================
-- KidsGuard — screen time: per-app daily usage reported by the child device.
-- ============================================================================

create table if not exists app_usage (
  id          bigserial primary key,
  child_id    uuid not null references children(id) on delete cascade,
  package     text not null,
  app_name    text not null,
  total_ms    bigint not null default 0,
  day         date not null,
  updated_at  timestamptz not null default now(),
  unique (child_id, package, day)
);
create index if not exists app_usage_child_day_idx on app_usage(child_id, day);

alter table app_usage enable row level security;

-- child device writes its own usage; parent reads
drop policy if exists app_usage_device on app_usage;
create policy app_usage_device on app_usage
  for all using (is_child_device(child_id)) with check (is_child_device(child_id));

drop policy if exists app_usage_parent_read on app_usage;
create policy app_usage_parent_read on app_usage
  for select using (owns_child(child_id));

-- Child device: bulk upsert today's per-app usage.
-- p_items = [{"package":"...","app_name":"...","total_ms":123}, ...]
create or replace function upsert_usage(p_child uuid, p_day date, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then
    raise exception 'not this device''s child';
  end if;
  insert into app_usage (child_id, package, app_name, total_ms, day, updated_at)
  select p_child,
         it->>'package',
         coalesce(it->>'app_name', it->>'package'),
         coalesce((it->>'total_ms')::bigint, 0),
         p_day,
         now()
  from jsonb_array_elements(p_items) as it
  on conflict (child_id, package, day)
  do update set total_ms = excluded.total_ms,
                app_name = excluded.app_name,
                updated_at = now();
end;
$$;

-- Parent: a child's app usage for a given day (default today), top first.
create or replace function usage_for_child(p_child uuid, p_day date default current_date)
returns table (package text, app_name text, total_ms bigint) language sql stable security definer set search_path = public as $$
  select u.package, u.app_name, u.total_ms
  from app_usage u
  where u.child_id = p_child and u.day = p_day and owns_child(p_child)
  order by u.total_ms desc;
$$;
