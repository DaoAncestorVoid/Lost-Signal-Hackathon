-- Secure, claim-scoped direct messages. A claim creates the conversation;
-- no public inboxes or user-search required. Each claim has exactly two participants.
-- Rejected claims have no active chat; pending/approved claims remain accessible.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_claim_created_idx on public.messages(claim_id, created_at desc, id desc);
alter table public.messages enable row level security;

revoke all on public.messages from public, anon, authenticated;
grant select on public.messages to authenticated;
grant insert (claim_id, sender_id, body) on public.messages to authenticated;

-- Claim SELECT RLS already restricts claim visibility to the claimant and
-- finder. These explicit checks also protect the messages table itself.
create policy "Only claim participants can read messages"
on public.messages for select to authenticated
using (
  coalesce((select (auth.jwt()->>'is_anonymous')::boolean), true) = false
  and exists (
    select 1 from public.claims c
    join public.reports r on r.id = c.report_id
    where c.id = messages.claim_id
      and c.status in ('pending','approved')
      and r.report_type = 'found'
      and (
        c.claimant_id = (select auth.uid())
        or r.user_id = (select auth.uid())
      )
  )
);

create policy "Only claim participants can send messages"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), true) = false
  and exists (
    select 1 from public.claims c
    join public.reports r on r.id = c.report_id
    where c.id = messages.claim_id
      and c.status in ('pending','approved')
      and r.report_type = 'found'
      and (
        c.claimant_id = (select auth.uid())
        or r.user_id = (select auth.uid())
      )
  )
);
