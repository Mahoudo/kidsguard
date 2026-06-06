-- ============================================================================
-- KidsGuard — weekly screen time aggregation for summaries.
-- ============================================================================

create or replace function usage_range(p_child uuid, p_from date, p_to date)
returns table (day date, total_ms bigint)
language sql stable security definer set search_path = public as $$
  select u.day, sum(u.total_ms)::bigint
  from app_usage u
  where u.child_id = p_child
    and u.day between p_from and p_to
    and owns_child(p_child)
  group by u.day
  order by u.day;
$$;
