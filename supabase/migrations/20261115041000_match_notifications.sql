create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  lost_report_id uuid not null references public.reports(id) on delete cascade,
  found_report_id uuid not null references public.reports(id) on delete cascade,
  score integer not null check (score between 50 and 100),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lost_report_id, found_report_id)
);
create index notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant insert (recipient_id, lost_report_id, found_report_id, score) on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "Read own notifications" on public.notifications
for select to authenticated using (recipient_id = (select auth.uid()));
create policy "Create own potential matches" on public.notifications
for insert to authenticated with check (
  recipient_id = (select auth.uid())
  and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true)) = false
  and exists (
    select 1 from public.reports lost join public.reports found on found.id = found_report_id
    where lost.id = lost_report_id and lost.user_id = (select auth.uid())
      and lost.report_type = 'lost' and lost.status = 'open'
      and found.report_type = 'found' and found.status = 'open'
      and found.user_id <> (select auth.uid())
      and found.created_at > lost.created_at
  )
);
create policy "Mark own notifications read" on public.notifications
for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));
