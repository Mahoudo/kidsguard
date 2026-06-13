-- ============================================================================
-- KidsGuard — community trust circle. Beyond the parents, a list of trusted
-- contacts (neighbour, uncle, school...) reachable on SOS. The child device
-- texts the whole circle when SOS fires — works offline, no app/data needed
-- (the African extended-family reality). Parents still get the push.
-- ============================================================================

create table if not exists circle_members (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  name       text not null,
  phone      text not null,
  created_at timestamptz not null default now()
);
alter table circle_members enable row level security;

drop policy if exists cm_manage on circle_members;
create policy cm_manage on circle_members
  for all using (owns_family(family_id)) with check (owns_family(family_id));

create or replace function add_circle_member(p_family uuid, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not owns_family(p_family) then raise exception 'not authorized'; end if;
  insert into circle_members(family_id, name, phone)
  values (p_family, p_name, p_phone) returning id into v_id;
  return v_id;
end; $$;

create or replace function list_circle(p_family uuid)
returns table (id uuid, name text, phone text)
language sql stable security definer set search_path = public as $$
  select id, name, phone from circle_members
  where family_id = p_family and owns_family(p_family)
  order by created_at;
$$;

create or replace function remove_circle_member(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select family_id into v_family from circle_members where id = p_id;
  if v_family is null or not owns_family(v_family) then raise exception 'not authorized'; end if;
  delete from circle_members where id = p_id;
end; $$;

-- Child reads the circle phone numbers to text them on SOS.
create or replace function my_circle_phones(p_child uuid)
returns table (name text, phone text)
language sql stable security definer set search_path = public as $$
  select cm.name, cm.phone
  from circle_members cm
  join children c on c.family_id = cm.family_id
  where c.id = p_child and is_child_device(p_child);
$$;
