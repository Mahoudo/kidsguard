-- ============================================================
-- KidsGuard — bundle migrations 0017 → 0021 (0016 déjà appliqué)
-- Coller dans Supabase → SQL Editor → Run
-- ============================================================

-- ===== 0017_supervision_consent =====
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

-- ===== 0018_pause_requests =====
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

-- ===== 0019_lost_mode =====
-- ============================================================================
-- KidsGuard — lost mode (legitimate anti-theft).
-- Parent flips the device to "lost": it locks and shows a full-screen message
-- with a callback number. No covert audio/camera — just recover the phone.
-- ============================================================================

alter table children add column if not exists lost_note text;

-- Turn lost mode on (locks + sets the on-screen note) or off.
create or replace function set_lost(p_child uuid, p_on boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  if p_on then
    update children set locked = true, lost_note = coalesce(p_note,
      'Téléphone perdu. Merci d''appeler le propriétaire.') where id = p_child;
  else
    update children set locked = false, lost_note = null where id = p_child;
  end if;
end; $$;

-- Child reads its lost note (shown on the lock screen).
create or replace function my_lost_note(p_child uuid)
returns text language sql stable security definer set search_path = public as $$
  select lost_note from children
  where id = p_child and (is_child_device(p_child) or owns_child(p_child));
$$;

-- ===== 0020_sim_alert =====
-- ============================================================================
-- KidsGuard — SIM-change alert (anti-theft). The child device reports its SIM
-- operator; when it changes, push the parent (a swapped SIM often means theft).
-- Best-effort: same-carrier swaps are not distinguishable on modern Android.
-- ============================================================================

alter table children add column if not exists last_sim text;

create or replace function report_sim(p_child uuid, p_sim text)
returns void language plpgsql security definer set search_path = public as $$
declare prev text; cname text;
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
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

-- ===== 0021_photo_privacy =====
-- ============================================================================
-- KidsGuard — photo privacy (on-device EXIF scan, metadata only).
-- The child app reads ONLY photo metadata (GPS tag present? yes/no) on-device
-- and reports counts. No image content ever leaves the device. Goal: warn the
-- parent if the child's photos are geotagged (a location-leak privacy risk).
-- ============================================================================

alter table children add column if not exists photo_total int;
alter table children add column if not exists photo_geotagged int;
alter table children add column if not exists photo_scanned_at timestamptz;

-- Child reports aggregate counts only (no filenames, no content).
create or replace function report_photo_privacy(p_child uuid, p_total int, p_geo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
  update children
    set photo_total = greatest(0, coalesce(p_total, 0)),
        photo_geotagged = greatest(0, coalesce(p_geo, 0)),
        photo_scanned_at = now()
  where id = p_child;
end; $$;

-- Parent reads the latest photo-privacy summary.
create or replace function photo_privacy(p_child uuid)
returns table (total int, geotagged int, scanned_at timestamptz)
language sql stable security definer set search_path = public as $$
  select photo_total, photo_geotagged, photo_scanned_at
  from children where id = p_child and owns_child(p_child);
$$;

