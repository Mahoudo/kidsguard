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
-- ---------------------------------------------------------------------------
revoke execute on function owner_push_token(uuid)                 from public, anon, authenticated;
revoke execute on function send_expo_push(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function push_child_sync(uuid)                  from public, anon, authenticated;

-- Trigger / cron functions — never called by a client.
revoke execute on function fn_check_geofence()       from public, anon, authenticated;
revoke execute on function fn_check_offline()        from public, anon, authenticated;
revoke execute on function fn_family_owner_member()  from public, anon, authenticated;
revoke execute on function fn_push_checkin()         from public, anon, authenticated;
revoke execute on function fn_push_geofence()        from public, anon, authenticated;
revoke execute on function fn_push_sos()             from public, anon, authenticated;
revoke execute on function fn_wake_child_change()    from public, anon, authenticated;
revoke execute on function fn_wake_child_command()   from public, anon, authenticated;
revoke execute on function fn_wake_child_limit()     from public, anon, authenticated;
revoke execute on function fn_wake_child_pause()     from public, anon, authenticated;
revoke execute on function fn_weekly_digest()        from public, anon, authenticated;
revoke execute on function handle_new_user()         from public, anon, authenticated;

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
