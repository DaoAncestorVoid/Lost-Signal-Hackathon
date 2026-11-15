-- Deletion is owner-only and cannot erase claim evidence. The claim functions
-- lock the report row, so the trigger also serializes with claim submission.
grant delete on public.reports to authenticated;

create policy "Protect active claim evidence from owner edits"
on public.reports as restrictive for update to authenticated
using (
  status = 'open'
  and not exists (select 1 from public.claims c where c.report_id = reports.id and c.status in ('pending', 'approved'))
)
with check (status = 'open');

create policy "Owners may delete reports without claims"
on public.reports for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true)) = false
  and not exists (select 1 from public.claims c where c.report_id = reports.id)
);

create function public.prevent_report_delete_with_claims()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.claims c where c.report_id = old.id) then
    raise exception using errcode = '23514', message = 'Reports with claims cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger prevent_report_delete_with_claims
before delete on public.reports for each row
execute function public.prevent_report_delete_with_claims();
