-- ============================================================================
-- KidsGuard — enable Realtime (postgres_changes) on the tables the apps subscribe to.
-- Without this, .on('postgres_changes', ...) never fires (tables not published).
-- ============================================================================

alter publication supabase_realtime add table public.locations;
alter publication supabase_realtime add table public.geofence_events;
alter publication supabase_realtime add table public.sos_alerts;
alter publication supabase_realtime add table public.commands;
