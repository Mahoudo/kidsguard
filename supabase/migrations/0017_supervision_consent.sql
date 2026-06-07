-- ============================================================================
-- KidsGuard — supervision consent (RGPD/COPPA governance).
-- Records the child's birth year and requires TWO distinct guardians to
-- consent before supervision is considered properly authorized. This is a
-- consent ledger (transparency), not a hard feature gate.
-- ============================================================================

alter table children add column if not exists birth_year int;

create table if not exists supervision_consents (
  child_id    uuid not null references children(id) on delete cascade,
  user_id     uuid not null,
  consented_at timestamptz not null default now(),
  primary key (child_id, user_id)
);

alter table supervision_consents enable row level security;

-- Guardians of the family can see/record consent for their children.
drop policy if exists sc_select on supervision_consents;
create policy sc_select on supervision_consents
  for select using (owns_child(child_id));

drop policy if exists sc_insert on supervision_consents;
create policy sc_insert on supervision_consents
  for insert with check (owns_child(child_id) and user_id = auth.uid());

drop policy if exists sc_delete on supervision_consents;
create policy sc_delete on supervision_consents
  for delete using (owns_child(child_id) and user_id = auth.uid());

-- Set the child's birth year (used for the minor/age clause).
create or replace function set_birth_year(p_child uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  update children set birth_year = p_year where id = p_child;
end; $$;

-- Current guardian records their consent.
create or replace function give_supervision_consent(p_child uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  insert into supervision_consents(child_id, user_id)
  values (p_child, auth.uid())
  on conflict (child_id, user_id) do nothing;
end; $$;

-- Status: how many guardians consented, whether the child is a minor, and
-- whether supervision is fully authorized (>= 2 consents AND a minor).
create or replace function supervision_status(p_child uuid)
returns table (consents int, is_minor boolean, active boolean)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from supervision_consents where child_id = p_child),
    coalesce(
      (select birth_year from children where id = p_child) is not null
      and (extract(year from now())::int
           - (select birth_year from children where id = p_child)) < 18,
      false),
    (select count(*) from supervision_consents where child_id = p_child) >= 2
      and coalesce(
        (select birth_year from children where id = p_child) is not null
        and (extract(year from now())::int
             - (select birth_year from children where id = p_child)) < 18,
        false)
  where owns_child(p_child);
$$;
