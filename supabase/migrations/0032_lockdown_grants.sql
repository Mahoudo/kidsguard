-- ============================================================================
-- KidsGuard — SECURITY lockdown of default EXECUTE/table grants (audit C1/H2/H1).
-- Postgres/PostgREST grant EXECUTE to PUBLIC (anon+authenticated) on every
-- public function by default, and the `children` policy is `for all`. This
-- closes three holes that let any anonymous child device or foreign-family
-- account abuse internal helpers or write children columns directly.
-- All revokes are idempotent. Run after 0031.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C1 — internal SECURITY DEFINER helpers must NOT be callable via supabase.rpc()
-- (they have no authorization check; they're only meant to run inside triggers).
-- Tolerant loop: only revokes the helpers that actually exist in this DB, so a
-- partially-applied migration history doesn't error the whole script.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select format('public.%I(%s)', p.proname,
                  pg_get_function_identity_arguments(p.oid)) as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'owner_push_token', 'send_expo_push', 'push_child_sync',
        'fn_check_geofence', 'fn_check_offline', 'fn_family_owner_member',
        'fn_push_checkin', 'fn_push_geofence', 'fn_push_sos',
        'fn_wake_child_change', 'fn_wake_child_command', 'fn_wake_child_limit',
        'fn_wake_child_pause', 'fn_weekly_digest', 'handle_new_user'
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- H2 — `children` is `for all` (UPDATE/DELETE) for any owner OR guardian, so a
-- guardian could PostgREST-write locked / device_user_id / pairing_code /
-- child_push_token directly, bypassing the hardened RPCs. Force all mutations
-- through the RPCs (set_child_lock, regenerate_pairing_code, set_child_push_token,
-- set_lost, set_birth_year, set_auto_school, create_child, delete_child).
-- Client code does ZERO direct children writes (verified) — only SELECT.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on table children from anon, authenticated;

-- ---------------------------------------------------------------------------
-- H1 — guardian invite was reusable for 24h (no single-use, no normalization).
-- Make it single-use: claim the row FOR UPDATE and null the code on success.
-- ---------------------------------------------------------------------------
create or replace function redeem_guardian_invite(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_family uuid;
begin
  select id into v_family from families
  where invite_code = upper(trim(p_code)) and invite_expires_at > now()
  for update;
  if v_family is null then raise exception 'code invalide ou expiré'; end if;
  insert into family_members (family_id, user_id, role)
  values (v_family, auth.uid(), 'guardian') on conflict do nothing;
  -- single use: invalidate the code immediately after a successful join
  update families set invite_code = null, invite_expires_at = null where id = v_family;
  return v_family;
end; $$;
