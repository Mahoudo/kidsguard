-- ============================================================================
-- OBSOLETE: superseded by 0022_guardians_safe.sql (owner-OR-member access +
-- owner backfill). Kept only for migration-history ordering; 0022 redefines
-- the same objects safely afterward.
-- ============================================================================
-- KidsGuard — multi-tuteurs (multiple guardians per family).
-- Extended families (UEMOA): several adults can follow the same children.
-- ============================================================================

create table if not exists family_members (
  family_id  uuid not null references families(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null default 'guardian', -- 'owner' | 'guardian'
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
alter table family_members enable row level security;

drop policy if exists fm_self on family_members;
create policy fm_self on family_members for select using (user_id = auth.uid());

-- Every existing family owner becomes a member.
insert into family_members (family_id, user_id, role)
select id, owner_id, 'owner' from families
on conflict do nothing;

-- New families: auto-add the owner as a member.
create or replace function fn_family_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into family_members (family_id, user_id, role)
  values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists trg_family_owner_member on families;
create trigger trg_family_owner_member after insert on families
  for each row execute function fn_family_owner_member();

-- ---- membership helpers (replace owner-only checks) ------------------------
create or replace function owns_family(p_family uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members
    where family_id = p_family and user_id = auth.uid()
  );
$$;

create or replace function owns_child(p_child uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from children c
    join family_members m on m.family_id = c.family_id
    where c.id = p_child and m.user_id = auth.uid()
  );
$$;

-- families: members read, only owner writes.
drop policy if exists families_owner on families;
drop policy if exists families_member_read on families;
drop policy if exists families_owner_write on families;
create policy families_member_read on families for select using (owns_family(id));
create policy families_owner_write on families
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---- guardian invites ------------------------------------------------------
alter table families add column if not exists invite_code text;
alter table families add column if not exists invite_expires_at timestamptz;

create or replace function create_guardian_invite(p_family uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not owns_family(p_family) then
    raise exception 'not authorized for this family';
  end if;
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from families where invite_code = v_code);
  end loop;
  update families set invite_code = v_code, invite_expires_at = now() + interval '24 hours'
  where id = p_family;
  return v_code;
end;
$$;

create or replace function redeem_guardian_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select id into v_family from families
  where invite_code = p_code and invite_expires_at > now();
  if v_family is null then
    raise exception 'code invalide ou expiré';
  end if;
  insert into family_members (family_id, user_id, role)
  values (v_family, auth.uid(), 'guardian') on conflict do nothing;
  return v_family;
end;
$$;

-- ---- parent-read RPCs: owner -> membership ---------------------------------
create or replace function children_overview()
returns table (
  id uuid, name text, avatar_url text, pairing_code text,
  last_battery_pct int, last_seen_at timestamptz,
  lng double precision, lat double precision, accuracy_m real, located_at timestamptz
) language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.avatar_url, c.pairing_code, c.last_battery_pct, c.last_seen_at,
         st_x(l.geog::geometry), st_y(l.geog::geometry), l.accuracy_m, l.recorded_at
  from children c
  join family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
  left join lateral (
    select geog, accuracy_m, recorded_at from locations
    where child_id = c.id order by recorded_at desc limit 1
  ) l on true
  order by c.created_at;
$$;

create or replace function places_overview()
returns table (id uuid, name text, kind place_kind, lng double precision, lat double precision, radius_m int)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.kind, st_x(p.center::geometry), st_y(p.center::geometry), p.radius_m
  from places p
  join family_members m on m.family_id = p.family_id and m.user_id = auth.uid()
  order by p.created_at;
$$;

create or replace function geofence_feed(p_limit int default 50)
returns table (id bigint, child_id uuid, child_name text, place_name text, direction geofence_dir, occurred_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.child_id, c.name, p.name, e.direction, e.occurred_at
  from geofence_events e
  join children c on c.id = e.child_id
  join places   p on p.id = e.place_id
  join family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
  order by e.occurred_at desc limit greatest(1, least(p_limit, 200));
$$;

create or replace function sos_feed(p_limit int default 50)
returns table (id uuid, child_id uuid, child_name text, lng double precision, lat double precision, battery_pct int, created_at timestamptz, resolved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.child_id, c.name, st_x(s.geog::geometry), st_y(s.geog::geometry), s.battery_pct, s.created_at, s.resolved_at
  from sos_alerts s
  join children c on c.id = s.child_id
  join family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
  order by s.created_at desc limit greatest(1, least(p_limit, 200));
$$;

create or replace function checkins_feed(p_limit int default 50)
returns table (id bigint, child_id uuid, child_name text, kind text, mood text, lng double precision, lat double precision, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select k.id, k.child_id, c.name, k.kind, k.mood, st_x(k.geog::geometry), st_y(k.geog::geometry), k.created_at
  from checkins k
  join children c on c.id = k.child_id
  join family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
  order by k.created_at desc limit greatest(1, least(p_limit, 200));
$$;
