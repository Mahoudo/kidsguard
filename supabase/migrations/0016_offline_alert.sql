-- ============================================================================
-- KidsGuard — offline / tamper alert.
-- If a child device stops checking in (app closed, no network, OR the app was
-- removed/uninstalled), notify the parent. This is the safety net: you can
-- never 100% prevent uninstall on a non-managed Android device, so detect it.
-- ============================================================================

alter table children add column if not exists offline_alert_at timestamptz;

-- Scan for children that went silent and push their parent once per outage.
create or replace function fn_check_offline() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select c.id, c.name
    from children c
    where c.last_seen_at is not null
      and c.last_seen_at < now() - interval '15 minutes'
      and (c.offline_alert_at is null or c.offline_alert_at < c.last_seen_at)
  loop
    perform send_expo_push(
      owner_push_token(r.id),
      '📵 Téléphone hors-ligne',
      coalesce(r.name, 'Un enfant') ||
        ' ne répond plus (app fermée, hors réseau, ou retirée).',
      jsonb_build_object('type', 'offline', 'child_id', r.id)
    );
    update children set offline_alert_at = now() where id = r.id;
  end loop;
end; $$;

-- Schedule every 5 minutes. Requires the pg_cron extension.
-- If `create extension pg_cron` fails (needs elevated rights), enable it once
-- via Supabase Dashboard → Database → Extensions → pg_cron, then re-run the
-- cron.schedule call below.
create extension if not exists pg_cron;

do $$ begin
  perform cron.unschedule('kidsguard-offline-check');
exception when others then null; end $$;

select cron.schedule('kidsguard-offline-check', '*/5 * * * *',
  $$select fn_check_offline()$$);
