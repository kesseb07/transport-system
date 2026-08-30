-- ===========================================================================
-- 0001_seat_reservations.sql
-- ---------------------------------------------------------------------------
-- Closes the concurrency defect reported in section 4.4 of the evaluative
-- essay: two passengers booking simultaneously could each be sold the same
-- seat, and a confirmed reservation could be silently erased.
--
-- WHY THE APPLICATION CANNOT FIX THIS ON ITS OWN
-- ----------------------------------------------
-- Seats were stored as an integer array on `schedules.reserved_seats`. Taking
-- a seat therefore meant reading the whole array, appending to it, and writing
-- it back. Two browsers doing that at once both read the same starting array,
-- so the second write overwrites the first. No amount of client-side checking
-- removes the gap between the read and the write, because the check and the
-- write are two separate journeys to the server.
--
-- The rule has to live where the writes are serialised, which is the database.
-- This migration gives it somewhere to live: one row per seat per bus, with a
-- primary key across both columns. PostgreSQL then refuses the second insert
-- outright. A double sale stops being something the application must remember
-- to prevent and becomes something the database cannot represent.
--
-- HOW TO APPLY
-- ------------
-- Supabase dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- It is idempotent, so running it twice is harmless.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The reservations table.
--
-- The composite primary key IS the fix. (schedule_id, seat_number) can exist
-- at most once, so the second concurrent insert fails with SQLSTATE 23505
-- (unique_violation) rather than silently succeeding.
-- ---------------------------------------------------------------------------
create table if not exists public.reservations (
  schedule_id text        not null references public.schedules(id) on delete cascade,
  seat_number integer     not null,
  booking_id  text,
  created_at  timestamptz not null default now(),
  constraint reservations_pkey primary key (schedule_id, seat_number),
  constraint reservations_seat_positive check (seat_number >= 1)
);

comment on table public.reservations is
  'One row per seat per bus. The composite primary key prevents the same seat being sold twice.';

create index if not exists reservations_schedule_idx
  on public.reservations (schedule_id);

-- ---------------------------------------------------------------------------
-- 2. Backfill from the existing arrays.
--
-- Every seat currently listed in schedules.reserved_seats becomes a row here,
-- so the new table starts out agreeing with the old one. `on conflict do
-- nothing` makes a re-run safe.
-- ---------------------------------------------------------------------------
insert into public.reservations (schedule_id, seat_number)
select s.id, seat
from public.schedules s
cross join lateral unnest(coalesce(s.reserved_seats, '{}'::integer[])) as seat
on conflict do nothing;

-- Attach booking ids where an existing booking matches, so the audit trail
-- survives. Left as null where no booking record exists.
update public.reservations r
set booking_id = b.id
from public.bookings b
where r.booking_id is null
  and b.schedule_id = r.schedule_id
  and b.seat_number = r.seat_number;

-- ---------------------------------------------------------------------------
-- 3. Keep schedules.reserved_seats in step.
--
-- The dispatch model and the seat map both read the array, and the essay's
-- leaky bucket uses its length as the bucket fill level. Rather than rewrite
-- those, a trigger keeps the array derived from the reservations table. The
-- array becomes a cached projection; the table remains the source of truth.
-- ---------------------------------------------------------------------------
create or replace function public.sync_reserved_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target text := coalesce(new.schedule_id, old.schedule_id);
begin
  update public.schedules s
  set reserved_seats = coalesce(
        (select array_agg(r.seat_number order by r.seat_number)
         from public.reservations r
         where r.schedule_id = target),
        '{}'::integer[])
  where s.id = target;
  return null;
end;
$$;

drop trigger if exists reservations_sync on public.reservations;
create trigger reservations_sync
  after insert or delete or update of seat_number, schedule_id
  on public.reservations
  for each row execute function public.sync_reserved_seats();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security.
--
-- The prototype runs entirely on the anon key, so these policies are
-- deliberately permissive and mirror the access the rest of the schema already
-- allows. A production deployment would restrict insert to an authenticated
-- role and remove the blanket delete.
-- ---------------------------------------------------------------------------
alter table public.reservations enable row level security;

drop policy if exists reservations_read on public.reservations;
create policy reservations_read on public.reservations
  for select using (true);

drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations
  for insert with check (true);

drop policy if exists reservations_delete on public.reservations;
create policy reservations_delete on public.reservations
  for delete using (true);

commit;

-- ---------------------------------------------------------------------------
-- 5. Verification. Run these after applying.
--
--   -- the two counts must agree
--   select (select count(*) from public.reservations)                       as reservation_rows,
--          (select coalesce(sum(cardinality(reserved_seats)), 0)
--             from public.schedules)                                        as seats_in_arrays;
--
--   -- proves the constraint bites: the second insert must raise 23505
--   insert into public.reservations (schedule_id, seat_number)
--   values ('sch-vip-rt-acc-kum-1', 999);
--   insert into public.reservations (schedule_id, seat_number)
--   values ('sch-vip-rt-acc-kum-1', 999);   -- expected: duplicate key value
--   delete from public.reservations
--   where schedule_id = 'sch-vip-rt-acc-kum-1' and seat_number = 999;
-- ---------------------------------------------------------------------------
