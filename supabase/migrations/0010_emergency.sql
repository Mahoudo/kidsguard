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
