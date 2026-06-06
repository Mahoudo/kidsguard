-- KidsGuard — bundle migrations 0006..0010 (cloud, à coller dans SQL Editor)

-- ======== 0006_realtime ========
-- ============================================================================
-- KidsGuard — enable Realtime (postgres_changes) on the tables the apps subscribe to.
-- Without this, .on('postgres_changes', ...) never fires (tables not published).
-- ============================================================================

alter publication supabase_realtime add table public.locations;
alter publication supabase_realtime add table public.geofence_events;
alter publication supabase_realtime add table public.sos_alerts;
alter publication supabase_realtime add table public.commands;

-- ======== 0007_push ========
-- ============================================================================
-- KidsGuard — background push notifications (Expo Push API via pg_net).
-- Parent receives a push when a child raises SOS or crosses a geofence,
-- even when the app is closed.
-- ============================================================================

create extension if not exists pg_net;

alter table profiles add column if not exists expo_push_token text;

-- Low-level: POST one message to Expo's push service.
create or replace function send_expo_push(
  p_token text, p_title text, p_body text, p_data jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token = '' then
    return;
  end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'to', p_token,
      'title', p_title,
      'body', p_body,
      'sound', 'default',
      'priority', 'high',
      'channelId', 'default',
      'data', p_data
    )
  );
end;
$$;

-- Resolve the parent's push token for a given child.
create or replace function owner_push_token(p_child uuid)
returns text language sql stable security definer set search_path = public as $$
  select p.expo_push_token
  from children c
  join families f on f.id = c.family_id
  join profiles p on p.id = f.owner_id
  where c.id = p_child;
$$;

-- SOS -> push
create or replace function fn_push_sos()
returns trigger language plpgsql security definer set search_path = public as $$
declare tok text; cname text;
begin
  tok := owner_push_token(new.child_id);
  select name into cname from children where id = new.child_id;
  perform send_expo_push(
    tok, '🆘 SOS',
    coalesce(cname, 'Un enfant') || ' a déclenché une alerte SOS !',
    jsonb_build_object('type', 'sos', 'child_id', new.child_id)
  );
  return new;
end;
$$;
drop trigger if exists trg_push_sos on sos_alerts;
create trigger trg_push_sos after insert on sos_alerts
  for each row execute function fn_push_sos();

-- Geofence enter/exit -> push
create or replace function fn_push_geofence()
returns trigger language plpgsql security definer set search_path = public as $$
declare tok text; cname text; pname text; verb text;
begin
  tok := owner_push_token(new.child_id);
  select name into cname from children where id = new.child_id;
  select name into pname from places where id = new.place_id;
  verb := case when new.direction = 'enter' then 'arrivé(e) à' else 'parti(e) de' end;
  perform send_expo_push(
    tok, 'Alerte zone',
    coalesce(cname, 'Enfant') || ' est ' || verb || ' ' || coalesce(pname, 'une zone'),
    jsonb_build_object('type', 'geofence', 'child_id', new.child_id)
  );
  return new;
end;
$$;
drop trigger if exists trg_push_geofence on geofence_events;
create trigger trg_push_geofence after insert on geofence_events
  for each row execute function fn_push_geofence();

-- ======== 0008_screentime ========
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

-- ======== 0009_checkins ========
-- ============================================================================
-- KidsGuard — "Je suis safe" check-ins from the child (1-tap reassurance).
-- Transparent, child-initiated. Notifies the parent (feed + push).
-- ============================================================================

create table if not exists checkins (
  id          bigserial primary key,
  child_id    uuid not null references children(id) on delete cascade,
  kind        text not null default 'safe',   -- 'safe' | 'arrived'
  mood        text,                            -- 'happy' | 'ok' | 'sad'
  geog        geography(Point, 4326),
  created_at  timestamptz not null default now()
);
create index if not exists checkins_child_time_idx on checkins(child_id, created_at desc);

alter table checkins enable row level security;

drop policy if exists checkins_device_insert on checkins;
create policy checkins_device_insert on checkins
  for insert with check (is_child_device(child_id));

drop policy if exists checkins_parent_read on checkins;
create policy checkins_parent_read on checkins
  for select using (owns_child(child_id));

-- Child device: send a check-in (with position).
create or replace function send_checkin(
  p_child uuid, p_kind text, p_mood text,
  p_lng double precision default null, p_lat double precision default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then
    raise exception 'not this device''s child';
  end if;
  insert into checkins (child_id, kind, mood, geog)
  values (
    p_child, coalesce(p_kind, 'safe'), p_mood,
    case when p_lng is null or p_lat is null then null
         else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end
  );
end;
$$;

-- Parent: recent check-ins with child name + decoded coords.
create or replace function checkins_feed(p_limit int default 50)
returns table (
  id bigint, child_id uuid, child_name text, kind text, mood text,
  lng double precision, lat double precision, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select k.id, k.child_id, c.name, k.kind, k.mood,
         st_x(k.geog::geometry), st_y(k.geog::geometry), k.created_at
  from checkins k
  join children c on c.id = k.child_id
  join families f on f.id = c.family_id and f.owner_id = auth.uid()
  order by k.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;

-- Push the parent on a check-in (reuses send_expo_push from 0007_push.sql).
create or replace function fn_push_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
declare tok text; cname text; msg text;
begin
  begin
    tok := owner_push_token(new.child_id);
  exception when undefined_function then
    tok := null; -- 0007 not applied yet
  end;
  select name into cname from children where id = new.child_id;
  msg := coalesce(cname, 'Enfant') ||
         case when new.kind = 'arrived' then ' est bien arrivé(e) 💚'
              else ' va bien 💚' end;
  if tok is not null then
    perform send_expo_push(tok, 'Tout va bien', msg,
      jsonb_build_object('type', 'checkin', 'child_id', new.child_id));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_push_checkin on checkins;
create trigger trg_push_checkin after insert on checkins
  for each row execute function fn_push_checkin();

-- realtime
alter publication supabase_realtime add table public.checkins;

-- ======== 0010_emergency ========
-- ============================================================================
-- KidsGuard — emergency phone for offline SOS fallback (SMS).
-- Parent sets a family emergency number; child caches it and, if there is no
-- data connection during an SOS, opens an SMS to it with a location link.
-- ============================================================================

alter table families add column if not exists emergency_phone text;

-- Parent: set the family's emergency phone number.
create or replace function set_emergency_phone(p_family uuid, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_family(p_family) then
    raise exception 'not authorized for this family';
  end if;
  update families set emergency_phone = nullif(trim(p_phone), '') where id = p_family;
end;
$$;

-- Parent: read current emergency phone (for the settings field).
create or replace function get_emergency_phone(p_family uuid)
returns text language sql stable security definer set search_path = public as $$
  select emergency_phone from families where id = p_family and owns_family(p_family);
$$;

-- Child device: read its family's emergency phone (to cache locally).
create or replace function my_emergency_phone()
returns text language sql stable security definer set search_path = public as $$
  select f.emergency_phone
  from children c
  join families f on f.id = c.family_id
  where c.device_user_id = auth.uid()
  limit 1;
$$;
