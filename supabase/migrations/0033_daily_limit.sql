-- ============================================================================
-- KidsGuard — daily screen-time cap + bonus minutes.
-- Parent sets a total daily limit (whole device). Bonus minutes (chores/grades)
-- add to today's cap. Child device enforces (native overlay when reached).
-- ============================================================================

alter table children add column if not exists daily_limit_min int; -- null = no cap

create table if not exists screen_bonus (
  id         uuid primary key default uuid_generate_v4(),
  child_id   uuid not null references children(id) on delete cascade,
  day        date not null default current_date,
  minutes    int  not null,
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists screen_bonus_child_day on screen_bonus(child_id, day);
alter table screen_bonus enable row level security;

drop policy if exists screen_bonus_parent on screen_bonus;
create policy screen_bonus_parent on screen_bonus
  for all using (owns_child(child_id)) with check (owns_child(child_id));
drop policy if exists screen_bonus_device_read on screen_bonus;
create policy screen_bonus_device_read on screen_bonus
  for select using (is_child_device(child_id));

-- Parent sets the daily cap (null/0 -> no cap). Wakes the child to re-apply.
create or replace function set_daily_limit(p_child uuid, p_min int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  update children set daily_limit_min = nullif(p_min, 0) where id = p_child;
  perform push_child_sync(p_child);
end; $$;

-- Parent grants bonus minutes for today. Wakes the child to extend the cap.
create or replace function grant_screen_bonus(p_child uuid, p_min int, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not owns_child(p_child) then raise exception 'not authorized'; end if;
  insert into screen_bonus (child_id, minutes, reason) values (p_child, p_min, p_reason);
  perform push_child_sync(p_child);
end; $$;

-- Effective cap for TODAY in minutes (base limit + today's bonus), or null if
-- no cap. Readable by the child device (to enforce) and the owning parent.
create or replace function my_screen_quota(p_child uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when c.daily_limit_min is null then null
    else c.daily_limit_min + coalesce(
      (select sum(b.minutes) from screen_bonus b
       where b.child_id = p_child and b.day = current_date), 0)
  end
  from children c
  where c.id = p_child and (is_child_device(p_child) or owns_child(p_child));
$$;
