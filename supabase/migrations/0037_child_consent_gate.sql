-- ============================================================================
-- Audit H5 — enforce the CHILD device's consent SERVER-SIDE (not just the local
-- AsyncStorage flag). Sensitive collectors now require a recorded consent.
--
-- Blast radius is limited on purpose: only the newer sensitive collectors
-- (installed apps, SIM identity, photo metadata) are gated here. Location/SOS
-- are NOT gated in this migration (changing the core ingest path is higher risk
-- and should be done + tested separately).
--
-- Existing paired children are BACKFILLED as consented so nothing breaks.
-- ============================================================================

alter table children add column if not exists device_consented_at timestamptz;

-- Backfill: a child that is already paired (device bound) accepted consent at
-- pairing time; record it so the gate below doesn't lock them out.
update children
  set device_consented_at = coalesce(device_consented_at, now())
  where device_user_id is not null;

-- The child device records its consent (called right after pairing succeeds).
create or replace function record_child_consent(p_child uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then raise exception 'not this device''s child'; end if;
  update children set device_consented_at = coalesce(device_consented_at, now())
    where id = p_child;
end; $$;
revoke execute on function record_child_consent(uuid) from anon;

-- True once the child device has recorded consent.
create or replace function has_child_consent(p_child uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select device_consented_at is not null from children where id = p_child;
$$;
revoke execute on function has_child_consent(uuid) from anon, authenticated;

-- ---- Re-declare the 3 sensitive collectors WITH the consent gate added ------

create or replace function report_installed_apps(p_child uuid, p_apps jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_new int := 0; v_owner_token text;
begin
  if not is_child_device(p_child) then raise exception 'not this device''s child'; end if;
  if not has_child_consent(p_child) then raise exception 'consent required'; end if;
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
  if v_new > 0 then
    select child_push_token into v_owner_token from children where id = p_child;
    if v_owner_token is not null then perform push_child_sync(p_child); end if;
  end if;
  return v_new;
end; $$;

create or replace function report_sim(p_child uuid, p_sim text)
returns void language plpgsql security definer set search_path = public as $$
declare prev text; cname text;
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
  if not has_child_consent(p_child) then raise exception 'consent required'; end if;
  select last_sim, name into prev, cname from children where id = p_child;
  if prev is not null and p_sim is not null and prev <> p_sim then
    perform send_expo_push(
      owner_push_token(p_child),
      '📱 Changement de carte SIM',
      'Une nouvelle SIM a été insérée dans le téléphone de ' ||
        coalesce(cname, 'ton enfant') || '. Vol possible.',
      jsonb_build_object('type', 'sim_change', 'child_id', p_child)
    );
  end if;
  update children set last_sim = p_sim where id = p_child and p_sim is not null;
end; $$;

create or replace function report_photo_privacy(p_child uuid, p_total int, p_geo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
  if not has_child_consent(p_child) then raise exception 'consent required'; end if;
  update children
    set photo_total = greatest(0, coalesce(p_total, 0)),
        photo_geotagged = greatest(0, coalesce(p_geo, 0)),
        photo_scanned_at = now()
  where id = p_child;
end; $$;
