-- ============================================================================
-- KidsGuard — photo privacy (on-device EXIF scan, metadata only).
-- The child app reads ONLY photo metadata (GPS tag present? yes/no) on-device
-- and reports counts. No image content ever leaves the device. Goal: warn the
-- parent if the child's photos are geotagged (a location-leak privacy risk).
-- ============================================================================

alter table children add column if not exists photo_total int;
alter table children add column if not exists photo_geotagged int;
alter table children add column if not exists photo_scanned_at timestamptz;

-- Child reports aggregate counts only (no filenames, no content).
create or replace function report_photo_privacy(p_child uuid, p_total int, p_geo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_child_device(p_child) then raise exception 'not authorized'; end if;
  update children
    set photo_total = greatest(0, coalesce(p_total, 0)),
        photo_geotagged = greatest(0, coalesce(p_geo, 0)),
        photo_scanned_at = now()
  where id = p_child;
end; $$;

-- Parent reads the latest photo-privacy summary.
create or replace function photo_privacy(p_child uuid)
returns table (total int, geotagged int, scanned_at timestamptz)
language sql stable security definer set search_path = public as $$
  select photo_total, photo_geotagged, photo_scanned_at
  from children where id = p_child and owns_child(p_child);
$$;
