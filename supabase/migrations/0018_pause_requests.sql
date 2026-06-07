-- ============================================================================
-- KidsGuard — child-initiated pause request (transparency, not a bypass).
-- The child can ask for a short pause of blocking/focus. The parent is pushed
-- and may grant N minutes. While a grant is active the child app suspends
-- enforcement. No content is hidden; every request is logged.
-- ============================================================================

create table if not exists pause_requests (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references children(id) on delete cascade,
  minutes       int  not null default 15,
  status        text not null default 'pending',   -- pending | granted | denied
  granted_until timestamptz,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);

create index if not exists pause_requests_child_idx on pause_requests(child_id, created_at desc);

alter table pause_requests enable row level security;

drop policy if exists pr_guardian_select on pause_requests;
create policy pr_guardian_select on pause_requests
  for select using (owns_child(child_id));

drop policy if exists pr_device_select on pause_requests;
create policy pr_device_select on pause_requests
  for select using (is_child_device(child_id));

-- Realtime so the parent sees requests and the child sees grants immediately.
alter publication supabase_realtime add table public.pause_requests;

-- Child asks for a pause -> insert pending + push the parent.
create or replace function request_pause(p_child uuid, p_minutes int default 15)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; cname text;
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
  insert into pause_requests(child_id, minutes)
  values (p_child, greatest(5, least(120, coalesce(p_minutes, 15))))
  returning id into rid;
  select name into cname from children where id = p_child;
  perform send_expo_push(
    owner_push_token(p_child),
    '⏸️ Demande de pause',
    coalesce(cname, 'Ton enfant') || ' demande une pause de ' ||
      greatest(5, least(120, coalesce(p_minutes, 15))) || ' min.',
    jsonb_build_object('type', 'pause_request', 'child_id', p_child, 'request_id', rid)
  );
  return rid;
end; $$;

-- Parent grants or denies a request.
create or replace function respond_pause(p_request uuid, p_grant boolean, p_minutes int default null)
returns void language plpgsql security definer set search_path = public as $$
declare ch uuid; mins int;
begin
  select child_id, minutes into ch, mins from pause_requests where id = p_request;
  if ch is null then raise exception 'request not found'; end if;
  if not owns_child(ch) then raise exception 'not authorized'; end if;
  if p_grant then
    update pause_requests
      set status = 'granted',
          granted_until = now() + (greatest(5, least(120, coalesce(p_minutes, mins))) || ' minutes')::interval,
          responded_at = now()
      where id = p_request;
  else
    update pause_requests
      set status = 'denied', responded_at = now()
      where id = p_request;
  end if;
end; $$;

-- Active pause end time for a child (null if none active). Child app polls this.
create or replace function my_pause(p_child uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(granted_until)
  from pause_requests
  where child_id = p_child and status = 'granted' and granted_until > now()
    and (is_child_device(p_child) or owns_child(p_child));
$$;

-- Pending requests for the parent dashboard.
create or replace function pending_pauses()
returns table (id uuid, child_id uuid, child_name text, minutes int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.child_id, c.name, p.minutes, p.created_at
  from pause_requests p
  join children c on c.id = p.child_id
  where p.status = 'pending' and owns_child(p.child_id)
  order by p.created_at desc;
$$;
