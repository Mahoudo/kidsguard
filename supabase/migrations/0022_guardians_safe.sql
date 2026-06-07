-- ============================================================================
-- KidsGuard — multi-guardian (safe). Adds family_members + invite/redeem and
-- makes access checks "owner OR member" so the existing owner NEVER loses
-- access. Backfills every current owner as a member. Replaces 0012 (never
-- applied) without the breaking owner->membership switch.
-- ============================================================================

alter table families add column if not exists invite_code text;
alter table families add column if not exists invite_expires_at timestamptz;

create table if not exists family_members (
  family_id  uuid not null references families(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null default 'guardian',
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
alter table family_members enable row level security;

drop policy if exists fm_self on family_members;
create policy fm_self on family_members for select using (user_id = auth.uid());

-- Backfill: every existing family owner becomes a member.
insert into family_members (family_id, user_id, role)
select id, owner_id, 'owner' from families
on conflict (family_id, user_id) do nothing;

-- Access = owner OR member (never breaks the owner).
create or replace function owns_family(p_family uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from families f where f.id = p_family and f.owner_id = auth.uid())
      or exists (select 1 from family_members m where m.family_id = p_family and m.user_id = auth.uid());
$$;

create or replace function owns_child(p_child uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from children c
    join families f on f.id = c.family_id
    where c.id = p_child
      and (f.owner_id = auth.uid()
           or exists (select 1 from family_members m
                      where m.family_id = f.id and m.user_id = auth.uid()))
  );
$$;

-- Owner generates a 6-digit invite code valid 24h.
create or replace function create_guardian_invite(p_family uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not owns_family(p_family) then raise exception 'not authorized for this family'; end if;
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from families where invite_code = v_code);
  end loop;
  update families set invite_code = v_code, invite_expires_at = now() + interval '24 hours'
  where id = p_family;
  return v_code;
end; $$;

-- Another parent redeems the code and joins the family as a guardian.
create or replace function redeem_guardian_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select id into v_family from families
  where invite_code = p_code and invite_expires_at > now();
  if v_family is null then raise exception 'code invalide ou expiré'; end if;
  insert into family_members (family_id, user_id, role)
  values (v_family, auth.uid(), 'guardian') on conflict do nothing;
  return v_family;
end; $$;

-- children_overview: owner OR member, with the locked column.
drop function if exists children_overview();
create function children_overview()
returns table (
  id uuid, name text, avatar_url text, pairing_code text,
  last_battery_pct int, last_seen_at timestamptz,
  lng double precision, lat double precision, accuracy_m real, located_at timestamptz,
  locked boolean
) language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.avatar_url, c.pairing_code, c.last_battery_pct, c.last_seen_at,
         st_x(l.geog::geometry), st_y(l.geog::geometry), l.accuracy_m, l.recorded_at, c.locked
  from children c
  join families f on f.id = c.family_id
  left join lateral (
    select geog, accuracy_m, recorded_at from locations
    where child_id = c.id order by recorded_at desc limit 1
  ) l on true
  where f.owner_id = auth.uid()
     or exists (select 1 from family_members m where m.family_id = f.id and m.user_id = auth.uid())
  order by c.created_at;
$$;
