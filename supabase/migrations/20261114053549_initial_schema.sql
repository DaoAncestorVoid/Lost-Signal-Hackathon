
-- LostSignal initial database schema

-- 1. Lost and found reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id) on delete cascade,

  report_type text not null
    check (report_type in ('lost', 'found')),

  title text not null
    check (char_length(trim(title)) between 1 and 120),

  description text not null
    check (char_length(trim(description)) between 1 and 3000),

  category text not null default 'other'
    check (char_length(trim(category)) between 1 and 60),

  location text not null
    check (char_length(trim(location)) between 1 and 200),

  item_date timestamptz,
  image_path text,

  status text not null default 'open'
    check (status in ('open', 'matched', 'resolved')),

  ai_description text,
  ai_attributes jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- 2. Private ownership claims
create table public.claims (
  id uuid primary key default gen_random_uuid(),

  report_id uuid not null
    references public.reports(id) on delete cascade,

  claimant_id uuid not null
    references auth.users(id) on delete cascade,

  proof text not null
    check (char_length(trim(proof)) between 1 and 2000),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  created_at timestamptz not null default now(),

  unique (report_id, claimant_id)
);

-- 3. Indexes for faster searching
create index reports_type_status_idx
  on public.reports(report_type, status);

create index reports_created_at_idx
  on public.reports(created_at desc);

create index claims_report_id_idx
  on public.claims(report_id);

-- 4. Enable Row Level Security
alter table public.reports enable row level security;
alter table public.claims enable row level security;

-- 5. Explicit database permissions
revoke all on public.reports, public.claims
  from anon, authenticated;

-- Signed-in users can browse reports.
grant select on public.reports to authenticated;

-- Users can create reports, but cannot directly
-- set AI-generated fields or resolution status.
grant insert (
  user_id, report_type, title, description,
  category, location, item_date, image_path
) on public.reports to authenticated;

-- Users can edit ordinary fields on their reports.
grant update (
  title, description, category, location,
  item_date, image_path, status
) on public.reports to authenticated;

-- Claims can be read by authorized users.
grant select on public.claims to authenticated;

-- Claimants cannot approve their own claims.
grant insert (
  report_id, claimant_id, proof
) on public.claims to authenticated;

grant update (status)
  on public.claims to authenticated;

-- 6. Reports security policies

create policy "Users can view reports"
on public.reports
for select to authenticated
using (true);

create policy "Users can create their reports"
on public.reports
for insert to authenticated
with check (
  user_id = (select auth.uid())
);

create policy "Users can update their reports"
on public.reports
for update to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

-- 7. Claims security policies

-- Only the claimant and the finder can see
-- a private claim.
create policy "Claim participants can view claims"
on public.claims
for select to authenticated
using (
  claimant_id = (select auth.uid())
  or exists (
    select 1 from public.reports r
    where r.id = claims.report_id
      and r.user_id = (select auth.uid())
  )
);

-- Claim only someone else's found item.
create policy "Users can submit claims"
on public.claims
for insert to authenticated
with check (
  claimant_id = (select auth.uid())
  and exists (
    select 1 from public.reports r
    where r.id = claims.report_id
      and r.report_type = 'found'
      and r.user_id <> (select auth.uid())
  )
);

-- Only the finder can approve or reject claims.
create policy "Finders can update claim status"
on public.claims
for update to authenticated
using (
  exists (
    select 1 from public.reports r
    where r.id = claims.report_id
      and r.user_id = (select auth.uid())
      and r.report_type = 'found'
  )
)
with check (
  exists (
    select 1 from public.reports r
    where r.id = claims.report_id
      and r.user_id = (select auth.uid())
      and r.report_type = 'found'
  )
);
