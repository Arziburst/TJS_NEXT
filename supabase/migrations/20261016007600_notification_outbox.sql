-- Sending the outbox (#26, D11): every 'order_created' event goes to two channels, Telegram to the owner's group
-- and an email to the customer. Each channel keeps its own outcome, so a retry sends only what has not gone out
-- yet; the event is processed once no channel is pending.
--
-- One processor run (src/lib/notifications/processor.ts, after an order is placed and by the daily cron):
--   1. claim_outbox_events takes the due events with FOR UPDATE SKIP LOCKED and leases them: attempts + 1,
--      next_attempt_at moved past the lease, a new claim_token. Two concurrent runs never claim the same event,
--      and an event whose run died is due again when its lease ends;
--   2. it sends each pending channel;
--   3. complete_outbox_event writes the outcome, only with the claim's token (a run whose lease ran out and was
--      claimed again cannot overwrite the newer claim): processed, or retried after a backoff.
-- The order itself is never touched: a failed message never rolls back or blocks an order.

-- pending: not sent yet (or retried later); sent: the provider accepted it; skipped_unconfigured: sending is not
-- configured where it ran (no key, chat id or sender, or sending is off), visible to the admin, never retried;
-- failed: the last attempt (MAX_ATTEMPTS) failed too
create type public.notification_delivery as enum ('pending', 'sent', 'skipped_unconfigured', 'failed');

alter table public.outbox_events
  add column telegram_status public.notification_delivery not null default 'pending',
  add column email_status    public.notification_delivery not null default 'pending',
  -- the current claim of a processor run; null while nobody holds the event
  add column claim_token     uuid,
  add constraint outbox_events_processed_when_done
    check ((processed_at is null) = (telegram_status = 'pending' or email_status = 'pending'));

-- Claims up to p_limit due events for p_lease_seconds and returns them with their new claim_token. For the
-- server only (service role).
create function public.claim_outbox_events(p_limit integer, p_lease_seconds integer)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 3600 then
    raise exception 'p_lease_seconds must be between 1 and 3600' using errcode = '22023';
  end if;

  return query
    with due as (
      select e.id
      from public.outbox_events e
      where e.processed_at is null and e.next_attempt_at <= now()
      order by e.next_attempt_at, e.created_at
      limit p_limit
      for update skip locked
    )
    update public.outbox_events e
    set attempts = e.attempts + 1,
        next_attempt_at = now() + make_interval(secs => p_lease_seconds),
        claim_token = gen_random_uuid()
    from due
    where e.id = due.id
    returning e.*;
end;
$$;

-- Writes the outcome of a claimed event. p_retry_in_seconds null (or left out): the event is processed (no channel may still
-- be pending); otherwise it is due again after that many seconds. False when the claim is no longer held.
create function public.complete_outbox_event(
  p_id uuid,
  p_claim_token uuid,
  p_telegram_status public.notification_delivery,
  p_email_status public.notification_delivery,
  p_last_error text default null,
  p_retry_in_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_retry_in_seconds is not null and p_retry_in_seconds < 0 then
    raise exception 'p_retry_in_seconds must not be negative' using errcode = '22023';
  end if;

  update public.outbox_events
  set telegram_status = p_telegram_status,
      email_status = p_email_status,
      last_error = left(p_last_error, 2000),
      processed_at = case when p_retry_in_seconds is null then now() end,
      next_attempt_at = case when p_retry_in_seconds is null then next_attempt_at
                             else now() + make_interval(secs => p_retry_in_seconds) end,
      claim_token = null
  where id = p_id and claim_token = p_claim_token and processed_at is null;
  return found;
end;
$$;

revoke all on function public.claim_outbox_events(integer, integer) from public, anon, authenticated;
revoke all on function public.complete_outbox_event(uuid, uuid, public.notification_delivery, public.notification_delivery, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_outbox_events(integer, integer) to service_role;
grant execute on function public.complete_outbox_event(uuid, uuid, public.notification_delivery, public.notification_delivery, text, integer)
  to service_role;
