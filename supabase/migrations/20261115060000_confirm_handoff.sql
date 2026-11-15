-- Confirmed return is separate from an approved ownership claim.
-- The claimant (recipient) explicitly attests that the physical handoff happened.
-- Existing approvals remain unconfirmed until their recipients confirm.
alter table public.claims
  add column handoff_confirmed_at timestamptz;

-- Do not grant direct UPDATE of the new column: only the controlled RPC writes it.
create or replace function public.confirm_claim_handoff(p_claim_id uuid)
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
  if v_user_id is null
    or coalesce((select (auth.jwt()->>'is_anonymous')::boolean), true) then
    raise exception using errcode = '42501', message = 'Permanent account required';
  end if;

  -- Use the same lock order as decide_claim to avoid concurrent deadlocks.
  select report_id into v_report_id
  from public.claims where id = p_claim_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Claim not found';
  end if;

  select * into v_report from public.reports
    where id = v_report_id for update;
  select * into v_claim from public.claims
    where id = p_claim_id for update;

  -- Hide unauthorized claims as not found.
  if not found or v_claim.claimant_id <> v_user_id
     or v_report.report_type <> 'found'
     or v_report.user_id = v_user_id then
    raise exception using errcode = 'P0002', message = 'Claim not found';
  end if;

  if v_claim.status <> 'approved' or v_report.status <> 'resolved'
     or v_claim.handoff_confirmed_at is not null then
    raise exception using errcode = '23514', message = 'Handoff is not eligible for confirmation';
  end if;

  update public.claims
    set handoff_confirmed_at = now()
    where id = p_claim_id
    returning * into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.confirm_claim_handoff(uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_claim_handoff(uuid)
  to authenticated;

-- Campus Karma now measures recipient-confirmed returns, not only approvals.
-- Keep the old RPC name for compatibility with already deployed clients,
-- but its result is now a count of confirmed handoffs.
create or replace function public.get_karma_approved_claim_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer;
begin
  if v_user_id is null
    or coalesce((select (auth.jwt()->>'is_anonymous')::boolean), true) then
    raise exception using errcode = '42501', message = 'Permanent account required';
  end if;

  select count(*)::integer into v_count
  from public.claims c
  join public.reports r on r.id = c.report_id
  where c.status = 'approved'
    and c.handoff_confirmed_at is not null
    and r.report_type = 'found'
    and r.user_id = v_user_id;

  return v_count;
end;
$$;
