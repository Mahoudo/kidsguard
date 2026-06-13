-- ============================================================================
-- KidsGuard — instant remote enforcement via a silent "wake" push.
-- When the parent changes a lock, focus window, app block, or grants a pause,
-- the child device gets a high-priority data push that wakes the app and
-- reapplies the rules immediately (no 60s wait, works app-closed).
-- ============================================================================

alter table children add column if not exists child_push_token text;

-- Child stores its Expo push token.
create or replace function set_child_push_token(p_child uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
  update children set child_push_token = p_token where id = p_child;
end; $$;

-- Send a silent, high-priority data push to the child to reapply rules now.
create or replace function push_child_sync(p_child uuid)
returns void language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  select child_push_token into tok from children where id = p_child;
  if tok is null or tok = '' then return; end if;
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
end; $$;

-- Lock / focus changes on the child -> wake it.
create or replace function fn_wake_child_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_child_sync(new.id);
  return new;
end; $$;
drop trigger if exists trg_wake_child_change on children;
create trigger trg_wake_child_change
  after update of locked, study_enabled, study_start, study_end,
                  sleep_enabled, sleep_start, sleep_end
  on children for each row execute function fn_wake_child_change();

-- App-block changes -> wake the affected child.
create or replace function fn_wake_child_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_child_sync(coalesce(new.child_id, old.child_id));
  return coalesce(new, old);
end; $$;
drop trigger if exists trg_wake_child_limit on app_limits;
create trigger trg_wake_child_limit
  after insert or update or delete on app_limits
  for each row execute function fn_wake_child_limit();

-- Pause granted/denied -> wake the child to suspend/restore enforcement.
create or replace function fn_wake_child_pause() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_child_sync(new.child_id);
  return new;
end; $$;
drop trigger if exists trg_wake_child_pause on pause_requests;
create trigger trg_wake_child_pause
  after update of status on pause_requests
  for each row execute function fn_wake_child_pause();
