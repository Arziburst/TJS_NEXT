-- Order requests (D19: storefront mode, no payment on the site) and the outbox of their notifications.
--
-- orders       one row per request. Status starts at 'new' (D17). Contacts, the delivery choice and its
--              estimate, the display currency with the rate it was priced at and the totals are a snapshot
--              taken by the server when the request was placed; nothing here is priced by the client.
-- order_items  the lines of an order, a snapshot of each product as it was ordered (title, prices,
--              quantity); product_id is kept only as a link and survives the product's removal as null.
-- outbox_events  one 'order_created' row per new order, written in the same transaction; the notifications
--              task (#26) delivers them (Telegram to the owner, email to the customer, D11) and marks them
--              processed. Nothing reads or writes it through the API.
--
-- Access: a signed-in customer reads only their own orders and their lines; a guest reads none through the
-- API (the confirmation page checks the guest's cookie token on the server, guest_access_hash). Only the
-- server writes, through public.create_order_request (service role). Admin access comes with #27.

-- D17: an order request is 'new'; the payment states are used only once payments are live (D7)
create type public.order_status as enum (
  'new', 'pending_payment', 'paid', 'in_processing', 'accepted', 'closed', 'canceled', 'refunded'
);

create table public.orders (
  id                         uuid primary key default gen_random_uuid(),
  -- the number shown to the customer and the owner (the confirmation page, messages); the uuid stays internal
  number                     bigint generated always as identity (start with 10001) unique,
  status                     public.order_status not null default 'new',
  -- the signed-in customer who placed it; null for a guest (and after the account is deleted)
  user_id                    uuid references auth.users (id) on delete set null,
  -- the client's token of one checkout attempt: a repeated submit returns the order it already created
  idempotency_key            uuid not null unique,
  -- sha256 (hex) of the token in the placing browser's httpOnly cookie: the confirmation page for a guest
  guest_access_hash          text check (guest_access_hash ~ '^[0-9a-f]{64}$'),
  -- the language the customer used: the notifications (#26) answer in it
  locale                     public.locale not null,

  first_name                 text not null check (btrim(first_name) <> '' and char_length(first_name) <= 100),
  last_name                  text check (last_name is null or (btrim(last_name) <> '' and char_length(last_name) <= 100)),
  phone                      text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email                      text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  comment                    text check (comment is null or (btrim(comment) <> '' and char_length(comment) <= 1000)),

  -- D2: Ukraine (Nova Poshta, D10) or an EU member state / Switzerland (Nova Post), never the UK
  country                    text not null check (country ~ '^[A-Z]{2}$' and country <> 'GB'),
  delivery_carrier           text not null check (delivery_carrier in ('nova_poshta', 'nova_post')),
  -- nova_poshta: warehouse | postomat | doors; nova_post: division | address
  delivery_method            text not null check (delivery_method in ('warehouse', 'postomat', 'doors', 'division', 'address')),
  -- where to ship, as the customer chose it (refs and names of the carrier's city and point, or the address);
  -- its shape per carrier and method is src/lib/checkout/schema.ts
  delivery_destination       jsonb not null check (jsonb_typeof(delivery_destination) = 'object'),
  -- the estimate shown at checkout (D35-D38: the customer pays the actual price to the carrier on receipt):
  -- an amount, 'tbd' (the zone flat rate is not set yet) or 'unavailable' (no quote at that moment)
  delivery_estimate_state    text not null check (delivery_estimate_state in ('amount', 'tbd', 'unavailable')),
  -- carrier: the carrier's tariff for the estimate box (D37); flat_rate: the zone's flat rate (D10)
  delivery_estimate_source   text check (delivery_estimate_source in ('carrier', 'flat_rate')),
  delivery_estimate_minor    bigint check (delivery_estimate_minor >= 0),
  delivery_estimate_currency text references public.currency_settings (currency),

  -- the visitor's display currency (D4, D5) and the USD→currency display rate the lines were priced at
  -- (1 for USD; fx_rate_date null then), with the markup of the currency's settings at that moment (D28)
  currency                   text not null references public.currency_settings (currency),
  currency_decimals          smallint not null check (currency_decimals between 0 and 4),
  fx_rate                    numeric not null check (fx_rate > 0),
  fx_rate_date               date,
  markup_bps                 integer not null check (markup_bps >= 0),
  -- the goods: the sum of the lines, in USD (the admin's prices) and in `currency` (as displayed). Delivery is
  -- not included: it is paid to the carrier on receipt
  items_total_usd_minor      bigint not null check (items_total_usd_minor >= 0),
  items_total_minor          bigint not null check (items_total_minor >= 0),

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint orders_carrier_of_country
    check ((country = 'UA') = (delivery_carrier = 'nova_poshta')),
  constraint orders_method_of_carrier
    check (case delivery_carrier
             when 'nova_poshta' then delivery_method in ('warehouse', 'postomat', 'doors')
             else delivery_method in ('division', 'address')
           end),
  constraint orders_estimate_amount
    check ((delivery_estimate_state = 'amount') = (delivery_estimate_minor is not null and delivery_estimate_currency is not null)),
  constraint orders_estimate_source
    check (delivery_estimate_state = 'unavailable' or delivery_estimate_source is not null)
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_currency_idx on public.orders (currency);
create index orders_delivery_estimate_currency_idx on public.orders (delivery_estimate_currency);

create table public.order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  -- the order of the lines as the customer saw them
  position             smallint not null check (position >= 0),
  product_id           uuid references public.products (id) on delete set null,
  -- reserved for product variants (#66)
  variant_id           uuid,
  sku                  text,
  fulfillment          public.product_fulfillment not null,
  title                text not null check (btrim(title) <> ''),
  -- the locale of `title`: the customer's, or the fallback the product had
  title_locale         public.locale not null,
  -- a one-of-a-kind piece is ordered once (D24); made-to-order lines are limited by the app (D36)
  quantity             integer not null check (quantity between 1 and 999),
  unit_price_usd_minor bigint not null check (unit_price_usd_minor >= 0),
  -- in the order's currency, as displayed (converted and charm-rounded, D4/D28)
  unit_price_minor     bigint not null check (unit_price_minor >= 0),
  line_total_usd_minor bigint not null,
  line_total_minor     bigint not null,
  constraint order_items_position_unique unique (order_id, position),
  constraint order_items_line_unique unique nulls not distinct (order_id, product_id, variant_id),
  constraint order_items_one_of_a_kind_once check (fulfillment = 'made_to_order' or quantity = 1),
  constraint order_items_line_totals
    check (line_total_usd_minor = unit_price_usd_minor * quantity and line_total_minor = unit_price_minor * quantity)
);

create index order_items_product_id_idx on public.order_items (product_id);

create table public.outbox_events (
  id              uuid primary key default gen_random_uuid(),
  event           text not null check (event in ('order_created')),
  order_id        uuid not null references public.orders (id) on delete cascade,
  -- what a sender needs to find the rest: { "number": 10001 }
  payload         jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at      timestamptz not null default now(),
  -- for the sender (#26): retries with backoff until processed (D11: sending never loses an order)
  attempts        integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  processed_at    timestamptz,
  last_error      text
);

create index outbox_events_pending_idx on public.outbox_events (next_attempt_at) where processed_at is null;
create index outbox_events_order_id_idx on public.outbox_events (order_id);

create function private.set_order_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_timestamps
  before insert or update on public.orders
  for each row execute function private.set_order_timestamps();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.outbox_events enable row level security;

revoke all on table public.orders, public.order_items, public.outbox_events from anon, authenticated;
grant select on table public.orders, public.order_items to authenticated;

create policy "orders: customer reads own"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()));

create policy "order_items: customer reads lines of own orders"
  on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

-- outbox_events: RLS on and no policy; only the service role (the server) reaches it.

-- Places an order request in one transaction, for the server only (service role): the server has re-read the
-- caller and built every number from the database (src/lib/checkout). In order:
--   1. claims p_order.idempotency_key: a repeated submit (a double click, a retry) waits for the first one and
--      gets its order back with "replayed": true, so one attempt never stores two orders;
--   2. stores the lines; a line whose product is no longer published (or deleted) is refused, and every
--      one-of-a-kind piece is reserved (private.reserve_one_of_a_kind, D24) in product order, so two concurrent
--      orders for the same piece cannot both get it; made-to-order lines need no reservation;
--   3. writes the 'order_created' outbox row.
-- Any refused line undoes the whole request (nothing is stored, no piece stays reserved) and the answer names
-- the refused products: { "ok": false, "reason": "unavailable", "product_ids": [...] }.
-- Success: { "ok": true, "replayed": bool, "order_id": uuid, "number": bigint, "user_id": uuid | null }.
create function public.create_order_request(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order       public.orders;
  v_item        jsonb;
  v_product     record;
  v_product_id  uuid;
  v_unavailable uuid[] := '{}';
  v_usd_total   bigint := 0;
  v_total       bigint := 0;
begin
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'p_order must be an object' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an order needs at least one line' using errcode = '22023';
  end if;

  begin
    insert into public.orders (
      user_id, idempotency_key, guest_access_hash, locale,
      first_name, last_name, phone, email, comment,
      country, delivery_carrier, delivery_method, delivery_destination,
      delivery_estimate_state, delivery_estimate_source, delivery_estimate_minor, delivery_estimate_currency,
      currency, currency_decimals, fx_rate, fx_rate_date, markup_bps,
      items_total_usd_minor, items_total_minor
    ) values (
      (p_order ->> 'user_id')::uuid,
      (p_order ->> 'idempotency_key')::uuid,
      p_order ->> 'guest_access_hash',
      (p_order ->> 'locale')::public.locale,
      p_order ->> 'first_name',
      p_order ->> 'last_name',
      p_order ->> 'phone',
      p_order ->> 'email',
      p_order ->> 'comment',
      p_order ->> 'country',
      p_order ->> 'delivery_carrier',
      p_order ->> 'delivery_method',
      p_order -> 'delivery_destination',
      p_order ->> 'delivery_estimate_state',
      p_order ->> 'delivery_estimate_source',
      (p_order ->> 'delivery_estimate_minor')::bigint,
      p_order ->> 'delivery_estimate_currency',
      p_order ->> 'currency',
      (p_order ->> 'currency_decimals')::smallint,
      (p_order ->> 'fx_rate')::numeric,
      (p_order ->> 'fx_rate_date')::date,
      (p_order ->> 'markup_bps')::integer,
      (p_order ->> 'items_total_usd_minor')::bigint,
      (p_order ->> 'items_total_minor')::bigint
    )
    on conflict (idempotency_key) do nothing
    returning * into v_order;

    if v_order.id is null then
      select * into strict v_order from public.orders where idempotency_key = (p_order ->> 'idempotency_key')::uuid;
      return jsonb_build_object(
        'ok', true, 'replayed', true, 'order_id', v_order.id, 'number', v_order.number, 'user_id', v_order.user_id
      );
    end if;

    -- product order: two requests that share pieces lock them in the same order (no deadlock)
    for v_item in
      select value from jsonb_array_elements(p_items) order by value ->> 'product_id', (value ->> 'position')::int
    loop
      v_product_id := (v_item ->> 'product_id')::uuid;
      select p.fulfillment, p.status, p.deleted_at, p.sku into v_product from public.products p where p.id = v_product_id;
      if not found or v_product.status <> 'published' or v_product.deleted_at is not null then
        v_unavailable := v_unavailable || v_product_id;
        continue;
      end if;
      if v_product.fulfillment = 'one_of_a_kind' and not private.reserve_one_of_a_kind(v_product_id) then
        v_unavailable := v_unavailable || v_product_id;
        continue;
      end if;

      insert into public.order_items (
        order_id, position, product_id, variant_id, sku, fulfillment, title, title_locale, quantity,
        unit_price_usd_minor, unit_price_minor, line_total_usd_minor, line_total_minor
      ) values (
        v_order.id,
        (v_item ->> 'position')::smallint,
        v_product_id,
        (v_item ->> 'variant_id')::uuid,
        v_product.sku,
        v_product.fulfillment,
        v_item ->> 'title',
        (v_item ->> 'title_locale')::public.locale,
        (v_item ->> 'quantity')::integer,
        (v_item ->> 'unit_price_usd_minor')::bigint,
        (v_item ->> 'unit_price_minor')::bigint,
        (v_item ->> 'unit_price_usd_minor')::bigint * (v_item ->> 'quantity')::integer,
        (v_item ->> 'unit_price_minor')::bigint * (v_item ->> 'quantity')::integer
      );
      v_usd_total := v_usd_total + (v_item ->> 'unit_price_usd_minor')::bigint * (v_item ->> 'quantity')::integer;
      v_total := v_total + (v_item ->> 'unit_price_minor')::bigint * (v_item ->> 'quantity')::integer;
    end loop;

    if cardinality(v_unavailable) > 0 then
      raise exception 'unavailable pieces' using errcode = 'TJ409';
    end if;
    if v_usd_total <> v_order.items_total_usd_minor or v_total <> v_order.items_total_minor then
      raise exception 'the totals do not match the lines' using errcode = '22023';
    end if;

    insert into public.outbox_events (event, order_id, payload)
    values ('order_created', v_order.id, jsonb_build_object('number', v_order.number));

    return jsonb_build_object(
      'ok', true, 'replayed', false, 'order_id', v_order.id, 'number', v_order.number, 'user_id', v_order.user_id
    );
  exception when sqlstate 'TJ409' then
    -- the block's writes (the order, its lines, the reservations) are undone; the variables keep their values
    return jsonb_build_object('ok', false, 'reason', 'unavailable', 'product_ids', to_jsonb(v_unavailable));
  end;
end;
$$;

revoke all on function public.create_order_request(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_request(jsonb, jsonb) to service_role;
