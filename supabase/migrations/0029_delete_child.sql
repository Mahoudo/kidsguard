-- ============================================================================
-- KidsGuard — allow a parent to permanently delete a child.
-- All child_id FKs are ON DELETE CASCADE, so removing the children row also
-- removes its locations, sos_alerts, check-ins, limits, pauses, consent, etc.
-- Guarded by owns_child (only the owning parent may delete).
-- ============================================================================

create or replace function delete_child(p_child uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then
    raise exception 'not authorized';
  end if;
  delete from children where id = p_child;
end; $$;
