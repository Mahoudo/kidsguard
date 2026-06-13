-- ============================================================================
-- KidsGuard — weekly digest. Every Sunday evening the parent gets a short
-- natural-language recap per child (school days, screen time, SOS, check-ins).
-- Builds daily engagement. Requires pg_cron + push (FCM) to deliver.
-- ============================================================================

create or replace function fn_weekly_digest() returns void
language plpgsql security definer set search_path = public as $$
declare r record; body text; school_days int; screen_h numeric; sos_n int; chk_n int;
begin
  for r in select c.id, c.name from children c loop
    select count(distinct date(ge.occurred_at)) into school_days
      from geofence_events ge join places p on p.id = ge.place_id
      where ge.child_id = r.id and p.kind = 'school' and ge.direction = 'enter'
        and ge.occurred_at > now() - interval '7 days';

    select round(coalesce(sum(total_ms), 0) / 3600000.0, 1) into screen_h
      from app_usage where child_id = r.id and day > (now() - interval '7 days')::date;

    select count(*) into sos_n from sos_alerts
      where child_id = r.id and created_at > now() - interval '7 days';

    select count(*) into chk_n from checkins
      where child_id = r.id and created_at > now() - interval '7 days';

    body := '📊 ' || coalesce(r.name, 'Ton enfant') || ' cette semaine : '
      || coalesce(school_days, 0) || 'j à l''école, '
      || coalesce(screen_h, 0) || 'h d''écran, '
      || coalesce(sos_n, 0) || ' SOS, '
      || coalesce(chk_n, 0) || ' check-ins.';

    perform send_expo_push(
      owner_push_token(r.id), '📊 Bilan de la semaine', body,
      jsonb_build_object('type', 'digest', 'child_id', r.id));
  end loop;
end; $$;

create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('kidsguard-weekly-digest');
exception when others then null; end $$;
-- Sunday 18:00 UTC.
select cron.schedule('kidsguard-weekly-digest', '0 18 * * 0',
  $$select fn_weekly_digest()$$);
