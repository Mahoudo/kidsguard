-- ============================================================================
-- Audit C3 — secure the WebRTC signaling channel (topic `rtc-<childId>`) with
-- Supabase Realtime Authorization, so only the paired parent (owns_child) or the
-- paired child device (is_child_device) can join / send on it. Without this,
-- anyone holding the anon key + a child UUID could spam the consent prompt or
-- MITM the video session.
--
-- SAFE / ADDITIVE: these policies only apply to PRIVATE realtime channels. The
-- current client still uses public broadcast, so nothing breaks on apply. The
-- client switches to `private: true` + supabase.realtime.setAuth() in a build
-- that ships ONLY after this migration is confirmed applied.
-- ============================================================================

-- realtime.messages already has RLS enabled on Supabase; ensure it.
alter table if exists realtime.messages enable row level security;

-- True when the JWT user may use the rtc-<childId> topic for this child.
create or replace function public.can_use_rtc_topic(p_topic text)
returns boolean language plpgsql stable security definer
set search_path = public as $$
declare v_child uuid;
begin
  if p_topic is null or left(p_topic, 4) <> 'rtc-' then
    return false;
  end if;
  begin
    v_child := substring(p_topic from 5)::uuid;
  exception when others then
    return false; -- topic suffix isn't a uuid
  end;
  return owns_child(v_child) or is_child_device(v_child);
end; $$;

drop policy if exists rtc_read_own on realtime.messages;
create policy rtc_read_own on realtime.messages
  for select to authenticated
  using ( public.can_use_rtc_topic((select realtime.topic())) );

drop policy if exists rtc_write_own on realtime.messages;
create policy rtc_write_own on realtime.messages
  for insert to authenticated
  with check ( public.can_use_rtc_topic((select realtime.topic())) );
