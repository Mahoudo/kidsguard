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
