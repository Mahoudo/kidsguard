-- ============================================================================
-- KidsGuard — install approval. The child reports its launchable apps; the
-- parent sees newly-installed ones (badge) and can block them. New installs
-- wake/notify the parent (transparent — app names only, no content).
-- ============================================================================

create table if not exists installed_apps (
  child_id   uuid not null references children(id) on delete cascade,
  package    text not null,
  name       text not null,
  first_seen timestamptz not null default now(),
  approved   boolean not null default false,
  primary key (child_id, package)
);
alter table installed_apps enable row level security;

drop policy if exists installed_apps_parent on installed_apps;
create policy installed_apps_parent on installed_apps
  for all using (owns_child(child_id)) with check (owns_child(child_id));
drop policy if exists installed_apps_device_rw on installed_apps;
create policy installed_apps_device_rw on installed_apps
  for select using (is_child_device(child_id));

-- Child reports the full app list; we INSERT only the ones we don't know yet
-- (so first_seen marks genuinely new installs). Returns the count of new apps.
create or replace function report_installed_apps(p_child uuid, p_apps jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_new int := 0; v_owner_token text;
begin
  if not is_child_device(p_child) then raise exception 'not this device''s child'; end if;
  with incoming as (
    select (a->>'package') as package, (a->>'name') as name
    from jsonb_array_elements(coalesce(p_apps, '[]'::jsonb)) a
  ),
  ins as (
    insert into installed_apps (child_id, package, name)
    select p_child, package, name from incoming
    on conflict (child_id, package) do nothing
    returning 1
  )
  select count(*) into v_new from ins;
  -- Notify the parent if genuinely new apps appeared.
  if v_new > 0 then
    select child_push_token into v_owner_token from children where id = p_child;
    if v_owner_token is not null then perform push_child_sync(p_child); end if;
  end if;
  return v_new;
end; $$;

-- Parent: list installed apps (newest first), with whether each is blocked.
create or replace function list_installed_apps(p_child uuid)
returns table (package text, name text, first_seen timestamptz, blocked boolean)
language sql stable security definer set search_path = public as $$
  select ia.package, ia.name, ia.first_seen,
    coalesce(al.blocked, false) as blocked
  from installed_apps ia
  left join app_limits al on al.child_id = ia.child_id and al.package = ia.package
  where owns_child(p_child) and ia.child_id = p_child
  order by ia.first_seen desc;
$$;
