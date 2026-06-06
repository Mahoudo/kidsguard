-- ============================================================================
-- KidsGuard — background push notifications (Expo Push API via pg_net).
-- Parent receives a push when a child raises SOS or crosses a geofence,
-- even when the app is closed.
-- ============================================================================

create extension if not exists pg_net;

alter table profiles add column if not exists expo_push_token text;

-- Low-level: POST one message to Expo's push service.
create or replace function send_expo_push(
  p_token text, p_title text, p_body text, p_data jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token = '' then
    return;
  end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'to', p_token,
      'title', p_title,
      'body', p_body,
      'sound', 'default',
      'priority', 'high',
      'channelId', 'default',
      'data', p_data
    )
  );
end;
$$;

-- Resolve the parent's push token for a given child.
create or replace function owner_push_token(p_child uuid)
returns text language sql stable security definer set search_path = public as $$
  select p.expo_push_token
  from children c
  join families f on f.id = c.family_id
  join profiles p on p.id = f.owner_id
  where c.id = p_child;
$$;

-- SOS -> push
create or replace function fn_push_sos()
returns trigger language plpgsql security definer set search_path = public as $$
declare tok text; cname text;
begin
  tok := owner_push_token(new.child_id);
  select name into cname from children where id = new.child_id;
  perform send_expo_push(
    tok, '🆘 SOS',
    coalesce(cname, 'Un enfant') || ' a déclenché une alerte SOS !',
    jsonb_build_object('type', 'sos', 'child_id', new.child_id)
  );
  return new;
end;
$$;
drop trigger if exists trg_push_sos on sos_alerts;
create trigger trg_push_sos after insert on sos_alerts
  for each row execute function fn_push_sos();

-- Geofence enter/exit -> push
create or replace function fn_push_geofence()
returns trigger language plpgsql security definer set search_path = public as $$
declare tok text; cname text; pname text; verb text;
begin
  tok := owner_push_token(new.child_id);
  select name into cname from children where id = new.child_id;
  select name into pname from places where id = new.place_id;
  verb := case when new.direction = 'enter' then 'arrivé(e) à' else 'parti(e) de' end;
  perform send_expo_push(
    tok, 'Alerte zone',
    coalesce(cname, 'Enfant') || ' est ' || verb || ' ' || coalesce(pname, 'une zone'),
    jsonb_build_object('type', 'geofence', 'child_id', new.child_id)
  );
  return new;
end;
$$;
drop trigger if exists trg_push_geofence on geofence_events;
create trigger trg_push_geofence after insert on geofence_events
  for each row execute function fn_push_geofence();
