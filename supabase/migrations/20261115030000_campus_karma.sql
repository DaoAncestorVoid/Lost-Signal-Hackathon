-- Campus Karma v1 is read-only and derived from approved ownership claims.
-- An approval represents an accepted claim, not proof of physical return.
-- The SECURITY DEFINER function exposes only the current user's aggregate count.

create function public.get_karma_approved_claim_count()
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
    and r.report_type = 'found'
    and r.user_id = v_user_id;

  return v_count;
end;
$$;

revoke all on function public.get_karma_approved_claim_count()
from public, anon, authenticated;
grant execute on function public.get_karma_approved_claim_count()
to authenticated;
