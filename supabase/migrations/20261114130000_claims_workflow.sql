-- Claims must be created and decided through the transactional functions below.
-- The original RLS policies still govern reads; direct writes are no longer granted.
revoke insert (report_id, claimant_id, proof) on public.claims from authenticated;
revoke update (status) on public.claims from authenticated;

-- Keep private proof limited to the claimant and report owner even if another
-- permissive SELECT policy is added later.
create policy "Guard claim proof privacy"
on public.claims as restrictive for select to public
using (
  claimant_id = (select auth.uid())
  or exists (
    select 1 from public.reports r
    where r.id = claims.report_id
      and r.user_id = (select auth.uid())
  )
);

-- A database invariant protects against multiple approved claims even if a
-- future writer bypasses the API functions. Existing conflicting rows cause
-- this migration to fail rather than silently changing claim decisions.
create unique index claims_one_approved_per_report_idx
  on public.claims (report_id)
  where status = 'approved';

create function public.submit_claim(p_report_id uuid, p_proof text)
returns public.claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_report public.reports%rowtype;
  v_claim public.claims%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_proof is null or char_length(btrim(p_proof)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'Invalid proof';
  end if;

  -- The report lock serializes submissions with a concurrent approval.
  select * into v_report
  from public.reports
  where id = p_report_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found';
  end if;
  if v_report.user_id = v_user_id then
    raise exception using errcode = '42501', message = 'Cannot claim own report';
  end if;
  if v_report.report_type <> 'found' or v_report.status <> 'open' then
    raise exception using errcode = '23514', message = 'Report is not claimable';
  end if;

  insert into public.claims (report_id, claimant_id, proof)
  values (p_report_id, v_user_id, btrim(p_proof))
  returning * into v_claim;
  return v_claim;
end;
$$;

create function public.decide_claim(p_claim_id uuid, p_decision text)
returns public.claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_report_id uuid;
  v_report public.reports%rowtype;
  v_claim public.claims%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Invalid decision';
  end if;

  select report_id into v_report_id
  from public.claims
  where id = p_claim_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Claim not found';
  end if;

  -- Every decision for this report takes the same lock first. A second
  -- approval waits, then sees the resolved report or a non-pending claim.
  select * into v_report
  from public.reports
  where id = v_report_id
  for update;
  if not found or v_report.user_id <> v_user_id then
    raise exception using errcode = 'P0002', message = 'Claim not found';
  end if;

  select * into v_claim
  from public.claims
  where id = p_claim_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Claim not found';
  end if;
  if v_report.report_type <> 'found' or v_report.status <> 'open'
     or v_claim.status <> 'pending' then
    raise exception using errcode = '23514', message = 'Claim is not pending on an open found report';
  end if;

  update public.claims
  set status = p_decision
  where id = p_claim_id
  returning * into v_claim;

  if p_decision = 'approved' then
    update public.reports
    set status = 'resolved'
    where id = v_report_id;

    update public.claims
    set status = 'rejected'
    where report_id = v_report_id
      and id <> p_claim_id
      and status = 'pending';
  end if;

  return v_claim;
end;
$$;

-- SECURITY DEFINER functions bypass RLS, so only authenticated sessions may
-- execute them. Each function checks auth.uid() and authorization itself.
revoke all on function public.submit_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.decide_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_claim(uuid, text) to authenticated;
grant execute on function public.decide_claim(uuid, text) to authenticated;
