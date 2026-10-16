-- Signed webhooks the app has accepted (#99, Supabase Auth's Send Email Hook): a signed request is valid for a
-- few minutes (its timestamp), and within them its id is accepted only once, so a captured request cannot be
-- replayed. Ids are hashed by the app. Only the server's service role may claim one.

create table private.webhook_receipts (
  id          text primary key check (char_length(id) between 1 and 200),
  received_at timestamptz not null default now()
);

create index webhook_receipts_received_at_idx on private.webhook_receipts (received_at);

alter table private.webhook_receipts enable row level security;

-- Records p_id and answers whether it is new (false: it was claimed before).
create function public.claim_webhook_receipt(p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new boolean;
begin
  if p_id is null or char_length(p_id) not between 1 and 200 then
    raise exception 'invalid webhook id' using errcode = '22023';
  end if;

  insert into private.webhook_receipts (id) values (p_id) on conflict (id) do nothing;
  v_new := found;

  -- A receipt older than a day is far past any signature's validity; about one call in a hundred sweeps them.
  if random() < 0.01 then
    delete from private.webhook_receipts r where r.received_at < now() - interval '1 day';
  end if;

  return v_new;
end;
$$;

revoke all on function public.claim_webhook_receipt(text) from public, anon, authenticated;
grant execute on function public.claim_webhook_receipt(text) to service_role;
