-- ============================================================================
-- KidsGuard — lost mode (legitimate anti-theft).
-- Parent flips the device to "lost": it locks and shows a full-screen message
-- with a callback number. No covert audio/camera — just recover the phone.
-- ============================================================================

alter table children add column if not exists lost_note text;

-- Turn lost mode on (locks + sets the on-screen note) or off.
create or replace function set_lost(p_child uuid, p_on boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  if p_on then
    update children set locked = true, lost_note = coalesce(p_note,
      'Téléphone perdu. Merci d''appeler le propriétaire.') where id = p_child;
  else
    update children set locked = false, lost_note = null where id = p_child;
  end if;
end; $$;

-- Child reads its lost note (shown on the lock screen).
create or replace function my_lost_note(p_child uuid)
returns text language sql stable security definer set search_path = public as $$
  select lost_note from children
  where id = p_child and (is_child_device(p_child) or owns_child(p_child));
$$;
