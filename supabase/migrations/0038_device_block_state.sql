-- ============================================================================
-- Gospion — reboot-proof remote enforcement (audit: post-reboot lock gap).
--
-- Problem: after a child-device reboot the RN/JS runtime does NOT auto-start on
-- aggressive OEMs (MIUI freezes it; Android 10+ blocks the boot Activity start),
-- so syncBlockRules() never runs and a NEW parent lock/unlock issued after the
-- reboot never reaches the device — until the app is opened by hand.
--
-- Fix: the accessibility service (the ONE component Android reliably restarts on
-- boot) polls Supabase directly. It authenticates with the anon key + a per-device
-- secret (no user JWT to refresh) and reads the EFFECTIVE block rules computed
-- here — the single source of truth, mirroring lib-child/blocker.ts.
--
-- Security: device_block_state() is anon-callable but gated by a 256-bit
-- per-device secret AND the child UUID; it is read-only and returns only block
-- rules (no PII). set_device_secret() is callable only by the paired child device.
-- Idempotent. Run after 0037.
-- ============================================================================

alter table children add column if not exists device_secret text;

-- ---------------------------------------------------------------------------
-- The paired child device registers (or rotates) its poll secret. Authed as the
-- device (anon session bound to this child). The secret is generated natively
-- with SecureRandom and uploaded here so the unauthenticated poll can use it.
-- ---------------------------------------------------------------------------
create or replace function set_device_secret(p_child uuid, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
  if p_secret is null or length(p_secret) < 32 then raise exception 'weak secret'; end if;
  update children set device_secret = p_secret where id = p_child;
end; $$;

-- ---------------------------------------------------------------------------
-- Effective block rules for a child, gated by the per-device secret. Callable
-- with ONLY the anon key (the native accessibility service has no user JWT).
-- Mirrors blocker.ts: a granted pause suspends enforcement UNLESS locked (a lock
-- always wins); auto-school forces Études all day; the cap is base + today's bonus.
-- Returns a flat JSON object the native service writes straight to its prefs.
-- ---------------------------------------------------------------------------
create or replace function device_block_state(p_child uuid, p_secret text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c        children%rowtype;
  v_paused timestamptz;
  v_locked boolean;
  v_pkgs   text[];
  v_cap    int;
  v_st_en  boolean;
  v_st_s   text;
  v_st_e   text;
begin
  select * into c from children where id = p_child;
  if not found then raise exception 'no such child'; end if;
  -- Secret gate (constant work; the secret is high-entropy and the UUID is not
  -- enumerable, so brute force is impractical).
  if c.device_secret is null or c.device_secret <> p_secret then
    raise exception 'bad secret';
  end if;

  v_locked := coalesce(c.locked, false);

  select max(granted_until) into v_paused
  from pause_requests
  where child_id = p_child and status = 'granted' and granted_until > now();

  -- Granted pause suspends everything (unless locked): clear all rules.
  if (not v_locked) and v_paused is not null and v_paused > now() then
    return jsonb_build_object(
      'locked', false,
      'packages', '[]'::jsonb,
      'study_enabled', false, 'study_start', null, 'study_end', null,
      'sleep_enabled', false, 'sleep_start', null, 'sleep_end', null,
      'daily_limit_min', 0
    );
  end if;

  select coalesce(array_agg(package), '{}'::text[]) into v_pkgs
  from app_limits where child_id = p_child and blocked;

  if coalesce(c.at_school, false) then
    v_st_en := true; v_st_s := '00:00'; v_st_e := '23:59';
  else
    v_st_en := coalesce(c.study_enabled, false);
    v_st_s := to_char(c.study_start, 'HH24:MI');
    v_st_e := to_char(c.study_end, 'HH24:MI');
  end if;

  if c.daily_limit_min is null then
    v_cap := 0;
  else
    v_cap := c.daily_limit_min + coalesce(
      (select sum(minutes) from screen_bonus
       where child_id = p_child and day = current_date), 0);
  end if;

  return jsonb_build_object(
    'locked', v_locked,
    'packages', to_jsonb(v_pkgs),
    'study_enabled', v_st_en, 'study_start', v_st_s, 'study_end', v_st_e,
    'sleep_enabled', coalesce(c.sleep_enabled, false),
    'sleep_start', to_char(c.sleep_start, 'HH24:MI'),
    'sleep_end', to_char(c.sleep_end, 'HH24:MI'),
    'daily_limit_min', v_cap
  );
end; $$;

-- Explicit grants (intentional: the poll runs as anon, gated by the secret).
grant execute on function set_device_secret(uuid, text) to authenticated;
grant execute on function device_block_state(uuid, text) to anon, authenticated;
