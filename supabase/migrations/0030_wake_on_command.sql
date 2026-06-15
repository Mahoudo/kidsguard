-- ============================================================================
-- KidsGuard — wake the child on a new parent command (ring / stop_ring / call).
-- Without this, "ring" only reached a child whose app was already subscribed to
-- realtime. MIUI/HyperOS kills background apps, so the command was never seen.
-- The silent push wakes the app, which then replays pending commands.
-- ============================================================================

create or replace function fn_wake_child_command() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_child_sync(new.child_id);
  return new;
end; $$;

drop trigger if exists trg_wake_child_command on commands;
create trigger trg_wake_child_command
  after insert on commands
  for each row execute function fn_wake_child_command();
