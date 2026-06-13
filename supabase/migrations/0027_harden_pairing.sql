-- ============================================================================
-- KidsGuard — SECURITY: harden device pairing (audit finding C1, critical).
-- 1) Strong codes: 8-char unambiguous alphanumeric (~656 billion combos)
--    instead of 6 digits (1M) -> brute force infeasible.
-- 2) Per-session rate limit + lockout on pair_device (defense in depth).
-- Also upgrades guardian-invite codes (finding M5).
-- ============================================================================

-- Unambiguous code generator (no I/L/O/0/1). 30^len space.
create or replace function kg_gen_code(len int default 8)
returns text language sql volatile set search_path = public as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (floor(random() * 30) + 1)::int, 1), '')
  from generate_series(1, len);
$$;

-- create_child: 8-char code.
create or replace function create_child(p_family uuid, p_name text, p_avatar text default null)
returns children language plpgsql security definer set search_path = public as $$
declare v_code text; v_child children;
begin
  if not owns_family(p_family) then raise exception 'not authorized for this family'; end if;
  loop
    v_code := kg_gen_code(8);
    exit when not exists (select 1 from children where pairing_code = v_code);
  end loop;
  insert into children (family_id, name, avatar_url, pairing_code, pairing_expires_at)
  values (p_family, p_name, p_avatar, v_code, now() + interval '30 minutes')
  returning * into v_child;
  return v_child;
end; $$;

-- Parent regenerates a fresh code (e.g. after the 30-min expiry).
create or replace function regenerate_pairing_code(p_child uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  loop
    v_code := kg_gen_code(8);
    exit when not exists (select 1 from children where pairing_code = v_code);
  end loop;
  update children
    set pairing_code = v_code, pairing_expires_at = now() + interval '30 minutes',
        device_user_id = null
    where id = p_child;
  return v_code;
end; $$;

-- Per-session pairing attempt limiter (no RLS policy = only definer funcs touch it).
create table if not exists pairing_attempts (
  user_id      uuid primary key,
  attempts     int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table pairing_attempts enable row level security;

-- Rate-limited, normalized pairing.
create or replace function pair_device(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_child children; v_uid uuid := auth.uid(); v_locked timestamptz;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select locked_until into v_locked from pairing_attempts where user_id = v_uid;
  if v_locked is not null and v_locked > now() then
    raise exception 'too many attempts, please retry later';
  end if;

  select * into v_child from children
  where pairing_code = upper(trim(p_code))
    and pairing_expires_at > now()
    and device_user_id is null
  for update;

  if not found then
    insert into pairing_attempts(user_id, attempts, locked_until, updated_at)
    values (v_uid, 1, null, now())
    on conflict (user_id) do update set
      attempts = pairing_attempts.attempts + 1,
      locked_until = case when pairing_attempts.attempts + 1 >= 8
                          then now() + interval '15 minutes' else null end,
      updated_at = now();
    raise exception 'invalid or expired pairing code';
  end if;

  delete from pairing_attempts where user_id = v_uid; -- success resets

  update children
    set device_user_id = v_uid, pairing_code = null,
        pairing_expires_at = null, paired_at = now()
    where id = v_child.id;
  return v_child.id;
end; $$;

-- Guardian invites: 8-char code too (finding M5).
create or replace function create_guardian_invite(p_family uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not owns_family(p_family) then raise exception 'not authorized for this family'; end if;
  loop
    v_code := kg_gen_code(8);
    exit when not exists (select 1 from families where invite_code = v_code);
  end loop;
  update families set invite_code = v_code, invite_expires_at = now() + interval '24 hours'
  where id = p_family;
  return v_code;
end; $$;
