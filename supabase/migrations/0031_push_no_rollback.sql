-- ============================================================================
-- KidsGuard — make the wake-push best-effort so a pg_net failure can NEVER
-- roll back the enforcement write that triggered it.
-- The wake triggers (lock change, new command, app_limit, pause) are AFTER
-- triggers running in the SAME transaction as the parent's UPDATE/INSERT. If
-- net.http_post raised (pg_net unavailable, bad URL, etc.) the whole parent
-- write rolled back -> parent thinks "locked" but children.locked stayed false.
-- Wrapping the push in an exception block decouples it from the core write.
-- ============================================================================

create or replace function push_child_sync(p_child uuid)
returns void language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  select child_push_token into tok from children where id = p_child;
  if tok is null or tok = '' then return; end if;
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'to', tok,
        'priority', 'high',
        '_contentAvailable', true,
        'data', jsonb_build_object('type', 'sync')
      )
    );
  exception when others then
    -- Never let a push subsystem error abort the parent's lock/command write.
    null;
  end;
end; $$;
