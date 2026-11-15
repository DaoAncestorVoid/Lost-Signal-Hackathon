-- Additive: retain existing match/activity rows, grants and policies.
create table public.conversation_reads (
  claim_id uuid not null references public.claims(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (claim_id,user_id)
);
alter table public.conversation_reads enable row level security;
revoke all on public.conversation_reads from public,anon,authenticated;
grant select,insert,update on public.conversation_reads to authenticated;
create policy "Participants access own read state" on public.conversation_reads
for all to authenticated using (
  user_id=(select auth.uid())
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean),true)=false
  and exists (select 1 from public.claims c join public.reports r on r.id=c.report_id
    where c.id=claim_id and c.status in ('pending','approved') and r.report_type='found'
    and (c.claimant_id=(select auth.uid()) or r.user_id=(select auth.uid())))
) with check (
  user_id=(select auth.uid()) and last_read_at<=now()
  and coalesce((select (auth.jwt()->>'is_anonymous')::boolean),true)=false
  and exists (select 1 from public.claims c join public.reports r on r.id=c.report_id
    where c.id=claim_id and c.status in ('pending','approved') and r.report_type='found'
    and (c.claimant_id=(select auth.uid()) or r.user_id=(select auth.uid())))
);

-- Invoker functions preserve message/claim/read-state RLS.
create function public.conversation_summaries()
returns table(claim_id uuid,report_id uuid,report_title text,latest_message_id uuid,
  body text,created_at timestamptz,unread_count bigint)
language sql stable security invoker set search_path='' as $$
  select c.id,c.report_id,r.title,m.id,m.body,coalesce(m.created_at,c.created_at),
    (select count(*) from public.messages incoming where incoming.claim_id=c.id
      and incoming.sender_id<>(select auth.uid())
      and incoming.created_at>coalesce(cr.last_read_at,'-infinity'::timestamptz))
  from public.claims c join public.reports r on r.id=c.report_id
  left join public.conversation_reads cr on cr.claim_id=c.id and cr.user_id=(select auth.uid())
  left join lateral (select msg.id,msg.body,msg.created_at from public.messages msg
    where msg.claim_id=c.id order by msg.created_at desc,msg.id desc limit 1) m on true
  where c.status in ('pending','approved') and r.report_type='found'
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean),true)=false
    and (c.claimant_id=(select auth.uid()) or r.user_id=(select auth.uid()))
  order by coalesce(m.created_at,c.created_at) desc,c.id;
$$;
create function public.mark_conversation_read(p_claim_id uuid,p_message_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare v_at timestamptz;
begin
  select m.created_at into v_at from public.messages m where m.id=p_message_id and m.claim_id=p_claim_id;
  if v_at is null then raise exception using errcode='42501',message='Message not accessible'; end if;
  insert into public.conversation_reads(claim_id,user_id,last_read_at)
    values(p_claim_id,(select auth.uid()),v_at)
    on conflict (claim_id,user_id) do update set last_read_at=greatest(public.conversation_reads.last_read_at,excluded.last_read_at);
  update public.activity_notifications set read_at=now() where claim_id=p_claim_id
    and recipient_id=(select auth.uid()) and kind='message' and created_at<=v_at and read_at is null;
end;
$$;
revoke all on function public.conversation_summaries() from public,anon;
revoke all on function public.mark_conversation_read(uuid,uuid) from public,anon;
grant execute on function public.conversation_summaries() to authenticated;
grant execute on function public.mark_conversation_read(uuid,uuid) to authenticated;
create index messages_incoming_read_idx on public.messages(claim_id,created_at,sender_id);

alter table public.activity_notifications drop constraint activity_notifications_kind_check;
alter table public.activity_notifications add constraint activity_notifications_kind_check
  check (kind in ('claim','message','approved','rejected','handoff'));
alter table public.activity_notifications drop constraint activity_notification_event_shape;
alter table public.activity_notifications add constraint activity_notification_event_shape check (
  (kind='message' and message_id is not null) or (kind<>'message' and message_id is null));
create unique index activity_notifications_claim_event_once_idx
  on public.activity_notifications(claim_id,kind) where kind<>'message';
create function public.notify_on_claim_updated()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_finder uuid;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    insert into public.activity_notifications(recipient_id,kind,report_id,claim_id)
      values(new.claimant_id,new.status,new.report_id,new.id) on conflict do nothing;
  end if;
  if old.handoff_confirmed_at is null and new.handoff_confirmed_at is not null then
    select r.user_id into v_finder from public.reports r where r.id=new.report_id;
    insert into public.activity_notifications(recipient_id,kind,report_id,claim_id)
      values(v_finder,'handoff',new.report_id,new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger notify_claim_decision_and_handoff after update on public.claims
  for each row execute function public.notify_on_claim_updated();
revoke all on function public.notify_on_claim_updated() from public,anon,authenticated;
