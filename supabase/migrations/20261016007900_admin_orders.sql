-- The admin's orders (#27): the owner reads every order request, keeps private notes on them and moves them
-- through their statuses (D17), which sells or releases one-of-a-kind pieces (D24) and tells the customer
-- (an 'order_status_changed' outbox event for the notifications, #26, D11).
--
-- order_notes           the admin's internal notes on an order: never shown to the customer, timestamped, with
--                       their author. Written only by an admin, as themself; kept as written (no edit).
-- order_status_history  one row per status change, written only by admin_set_order_status.
--
-- Access: admins read every order, line, note and history row (RLS after public.is_admin()); a customer still
-- reads only their own orders and lines and none of the notes or history; a guest reads nothing.

-- Admins read every order and its lines, next to the customer's own (#24) -----------------------------------

create policy "orders: admins read all"
  on public.orders for select to authenticated
  using ((select public.is_admin()));

create policy "order_items: admins read all"
  on public.order_items for select to authenticated
  using ((select public.is_admin()));

-- Internal notes ---------------------------------------------------------------------------------------------

create table public.order_notes (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  -- the admin who wrote it; null once that account is deleted
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body       text not null check (btrim(body) <> '' and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index order_notes_order_created_idx on public.order_notes (order_id, created_at);
create index order_notes_author_id_idx on public.order_notes (author_id);

alter table public.order_notes enable row level security;

revoke all on table public.order_notes from anon, authenticated;
grant select on table public.order_notes to authenticated;
-- created_at is the server's: a note's time cannot be set by its writer
grant insert (order_id, author_id, body) on table public.order_notes to authenticated;

create policy "order_notes: admins read"
  on public.order_notes for select to authenticated
  using ((select public.is_admin()));

create policy "order_notes: admins write their own"
  on public.order_notes for insert to authenticated
  with check ((select public.is_admin()) and author_id = (select auth.uid()));

-- Status history ---------------------------------------------------------------------------------------------

create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status not null,
  to_status   public.order_status not null,
  -- the admin who changed it; null once that account is deleted
  changed_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint order_status_history_changes check (from_status <> to_status)
);

create index order_status_history_order_created_idx on public.order_status_history (order_id, created_at);
create index order_status_history_changed_by_idx on public.order_status_history (changed_by);

alter table public.order_status_history enable row level security;

revoke all on table public.order_status_history from anon, authenticated;
grant select on table public.order_status_history to authenticated;

create policy "order_status_history: admins read"
  on public.order_status_history for select to authenticated
  using ((select public.is_admin()));

-- written only by admin_set_order_status (security definer); no API role writes it

-- The status change event for the notifications (#26) -------------------------------------------------------

alter table public.outbox_events drop constraint outbox_events_event_check;
alter table public.outbox_events
  add constraint outbox_events_event_check check (event in ('order_created', 'order_status_changed'));

-- The list ---------------------------------------------------------------------------------------------------

-- One page of the admin's order list: new requests first, then every order newest on top. Filters: status,
-- a range of Kyiv calendar dates (both ends included), the country, and a search in the number, the customer's
-- names, phone and email (plain substring, case-insensitive; a phone typed with spaces or dashes still matches).
-- Security invoker: RLS applies on top of the admin check. Answer: { total, new_count, items: [...] }.
create function public.admin_list_orders(
  p_status    public.order_status default null,
  p_date_from date default null,
  p_date_to   date default null,
  p_country   text default null,
  p_query     text default null,
  p_limit     integer default 20,
  p_offset    integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_query  text := nullif(btrim(coalesce(p_query, '')), '');
  v_phone  text;
  v_number bigint;
  v_result jsonb;
begin
  if not (select public.is_admin()) then
    raise exception 'only admins list orders' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception 'invalid page' using errcode = '22023';
  end if;
  if v_query is not null then
    if char_length(v_query) > 100 then
      raise exception 'the search is too long' using errcode = '22023';
    end if;
    v_query := lower(v_query);
    v_phone := nullif(regexp_replace(v_query, '[\s\-().]', '', 'g'), '');
    -- a number the list shows (#10001), typed with or without its "#"
    if v_query ~ '^#?[0-9]{1,18}$' then
      v_number := ltrim(v_query, '#')::bigint;
    end if;
  end if;

  with matching as (
    select o.*
    from public.orders o
    where (p_status is null or o.status = p_status)
      and (p_date_from is null or o.created_at >= (p_date_from::timestamp at time zone 'Europe/Kyiv'))
      and (p_date_to is null or o.created_at < ((p_date_to + 1)::timestamp at time zone 'Europe/Kyiv'))
      and (p_country is null or o.country = p_country)
      and (
        v_query is null
        or o.number = v_number
        or strpos(lower(o.first_name), v_query) > 0
        or strpos(lower(coalesce(o.last_name, '')), v_query) > 0
        or strpos(lower(o.first_name || ' ' || coalesce(o.last_name, '')), v_query) > 0
        or strpos(lower(o.email), v_query) > 0
        or (v_phone is not null and strpos(o.phone, v_phone) > 0)
      )
  ),
  page as (
    select m.*
    from matching m
    order by (m.status = 'new') desc, m.created_at desc, m.number desc
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'new_count', (select count(*) from matching where status = 'new'),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'number', p.number,
          'status', p.status,
          'created_at', p.created_at,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'phone', p.phone,
          'email', p.email,
          'country', p.country,
          'delivery_carrier', p.delivery_carrier,
          'delivery_method', p.delivery_method,
          'currency', p.currency,
          'currency_decimals', p.currency_decimals,
          'items_total_minor', p.items_total_minor,
          'quantity', (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = p.id)
        )
        order by (p.status = 'new') desc, p.created_at desc, p.number desc
      )
      from page p
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_list_orders(public.order_status, date, date, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_orders(public.order_status, date, date, text, text, integer, integer) to authenticated;

-- The status change ------------------------------------------------------------------------------------------

-- Moves order p_number from p_from (the status the admin saw) to p_to, in one transaction (D17, payment states
-- left out while payments are off):
--   new → in_processing → accepted → closed, and canceled from any of new, in_processing, accepted.
-- Accepting sells the order's one-of-a-kind pieces (D24); canceling puts them back on sale (reserved ones, and
-- the sold ones of an accepted order), except a piece another open order holds. Each change writes a history
-- row and an 'order_status_changed' outbox event { number, from, to } for the notifications (#26).
-- Answers { ok: true, status, product_ids } (the pieces whose availability changed), or
-- { ok: false, reason: 'not_found' | 'stale' | 'illegal' | 'conflict', status?, product_ids? }:
--   stale     the order is no longer in p_from (another tab or a double tap changed it first);
--   illegal   p_from → p_to is not a transition;
--   conflict  a piece of the order was already sold with another order (nothing changes).
create function public.admin_set_order_status(p_number bigint, p_from public.order_status, p_to public.order_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_pieces   uuid[];
  v_changed  uuid[] := '{}';
  v_conflict uuid[] := '{}';
  v_piece    uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'only admins change orders' using errcode = '42501';
  end if;
  if p_number is null or p_from is null or p_to is null then
    raise exception 'the order, its status and the new status are required' using errcode = '22023';
  end if;

  if not (
    (p_from = 'new' and p_to in ('in_processing', 'canceled'))
    or (p_from = 'in_processing' and p_to in ('accepted', 'canceled'))
    or (p_from = 'accepted' and p_to in ('closed', 'canceled'))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'illegal');
  end if;

  select * into v_order from public.orders where number = p_number for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_order.status <> p_from then
    return jsonb_build_object('ok', false, 'reason', 'stale', 'status', v_order.status);
  end if;

  -- the order's one-of-a-kind pieces that still exist, in product order (concurrent changes lock them alike)
  select coalesce(array_agg(distinct i.product_id order by i.product_id), '{}') into v_pieces
  from public.order_items i
  where i.order_id = v_order.id and i.fulfillment = 'one_of_a_kind' and i.product_id is not null;

  if p_to = 'accepted' then
    foreach v_piece in array v_pieces loop
      if private.mark_one_of_a_kind_sold(v_piece) then
        v_changed := v_changed || v_piece;
      elsif exists (
        select 1 from public.order_items i join public.orders o on o.id = i.order_id
        where i.product_id = v_piece and o.id <> v_order.id and o.status in ('accepted', 'closed', 'paid')
      ) then
        v_conflict := v_conflict || v_piece;
      end if;
      -- else: sold already without another order (the admin marked it), or no longer one of a kind
    end loop;
    if cardinality(v_conflict) > 0 then
      -- undo the pieces sold above: the whole change is refused
      raise exception 'conflict' using errcode = 'TJ409';
    end if;
  elsif p_to = 'canceled' then
    foreach v_piece in array v_pieces loop
      continue when exists (
        select 1 from public.order_items i join public.orders o on o.id = i.order_id
        where i.product_id = v_piece and o.id <> v_order.id
          and o.status in ('new', 'pending_payment', 'paid', 'in_processing', 'accepted')
      );
      update public.products set availability = 'available'
      where id = v_piece and fulfillment = 'one_of_a_kind'
        and (availability = 'reserved' or (availability = 'sold' and p_from = 'accepted'));
      if found then
        v_changed := v_changed || v_piece;
      end if;
    end loop;
  end if;

  update public.orders set status = p_to where id = v_order.id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order.id, p_from, p_to, (select auth.uid()));

  insert into public.outbox_events (event, order_id, payload)
  values ('order_status_changed', v_order.id, jsonb_build_object('number', v_order.number, 'from', p_from, 'to', p_to));

  return jsonb_build_object('ok', true, 'status', p_to, 'product_ids', to_jsonb(v_changed));
exception when sqlstate 'TJ409' then
  return jsonb_build_object('ok', false, 'reason', 'conflict', 'product_ids', to_jsonb(v_conflict));
end;
$$;

revoke all on function public.admin_set_order_status(bigint, public.order_status, public.order_status) from public, anon;
grant execute on function public.admin_set_order_status(bigint, public.order_status, public.order_status) to authenticated;
