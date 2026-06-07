-- ============================================================================
-- KidsGuard — SIM-change alert (anti-theft). The child device reports its SIM
-- operator; when it changes, push the parent (a swapped SIM often means theft).
-- Best-effort: same-carrier swaps are not distinguishable on modern Android.
-- ============================================================================

alter table children add column if not exists last_sim text;

create or replace function report_sim(p_child uuid, p_sim text)
returns void language plpgsql security definer set search_path = public as $$
declare prev text; cname text;
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
  select last_sim, name into prev, cname from children where id = p_child;
  if prev is not null and p_sim is not null and prev <> p_sim then
    perform send_expo_push(
      owner_push_token(p_child),
      '📱 Changement de carte SIM',
      'Une nouvelle SIM a été insérée dans le téléphone de ' ||
        coalesce(cname, 'ton enfant') || '. Vol possible.',
      jsonb_build_object('type', 'sim_change', 'child_id', p_child)
    );
  end if;
  update children set last_sim = p_sim where id = p_child and p_sim is not null;
end; $$;
