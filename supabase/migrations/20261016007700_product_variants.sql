-- Product variants (#66, D29): one made-to-order piece in several sizes or lengths (ring size, chain length …).
--
-- product_variants              a variant of a made-to-order product: its SKU suffix, its price difference to
--                               the product's price (USD cents, may be negative; the variant's price stays above
--                               zero), whether it can be ordered now, its place in the list and a soft delete
-- product_variant_translations  its label per locale ("17", "45 cm" …)
--
-- A one-of-a-kind piece (D24) exists once, so it has no variants: a trigger refuses a variant of one, and a
-- product with variants cannot become one. A product with variants is ordered only as one of them: the cart
-- line and the order line carry the variant (cart_items.variant_id, order_items.variant_id were reserved for it),
-- and the order line keeps the variant's label as ordered.
--
-- Access: the public reads the live variants of the products it can read (published, not deleted); only admins
-- write, through the functions below. They are security definer with an explicit admin check because a soft
-- delete under RLS cannot work for the API roles: they may not read deleted_at (column grants), and a policy
-- that hides deleted rows also refuses the update that hides one.

create table public.product_variants (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references public.products (id) on delete cascade,
  -- appended to the product's SKU on the order line: TJS-R-001 + 17.5 = TJS-R-001-17.5
  sku_suffix            text check (sku_suffix ~ '^[A-Za-z0-9]+([.-][A-Za-z0-9]+)*$' and char_length(sku_suffix) <= 32),
  -- the variant's price is the product's price_usd plus this, in US cents; a technical bound of ±$10 million
  price_delta_usd_minor integer not null default 0 check (price_delta_usd_minor between -1000000000 and 1000000000),
  -- a made-to-order size the owner cannot make for now: shown, not orderable
  is_available          boolean not null default true,
  position              integer not null default 0,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users (id) on delete set null,
  updated_by            uuid references auth.users (id) on delete set null
);

create index product_variants_product_position_idx on public.product_variants (product_id, position) where deleted_at is null;
create unique index product_variants_sku_suffix_unique
  on public.product_variants (product_id, upper(sku_suffix)) where deleted_at is null and sku_suffix is not null;
create index product_variants_created_by_idx on public.product_variants (created_by);
create index product_variants_updated_by_idx on public.product_variants (updated_by);

create trigger product_variants_audit
  before insert or update on public.product_variants
  for each row execute function private.set_audit_columns();

create table public.product_variant_translations (
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  locale     public.locale not null,
  label      text not null check (btrim(label) <> '' and char_length(label) <= 100),
  source     public.translation_source not null default 'human',
  primary key (variant_id, locale)
);

-- Rules across tables ----------------------------------------------------------------------------------------
-- Security definer: they read rows the caller may not see (order lines, deleted variants).

-- A live variant belongs to a made-to-order product, never moves to another product, and costs more than zero;
-- a variant that was ordered is never deleted (the owner disables it instead).
create function private.check_product_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
begin
  if tg_op = 'UPDATE' and new.product_id <> old.product_id then
    raise exception 'a variant stays with its product' using errcode = '23514';
  end if;
  if new.deleted_at is not null then
    if tg_op = 'UPDATE' and old.deleted_at is null
      and exists (select 1 from public.order_items where variant_id = new.id) then
      raise exception 'variant % was ordered: disable it instead', new.id using errcode = '23503';
    end if;
    return new;
  end if;
  select fulfillment, price_usd into v_product from public.products where id = new.product_id;
  if v_product.fulfillment is distinct from 'made_to_order' then
    raise exception 'a one-of-a-kind product has no variants' using errcode = '23514';
  end if;
  if round(v_product.price_usd * 100) + new.price_delta_usd_minor <= 0 then
    raise exception 'a variant costs more than zero' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger product_variants_rules
  before insert or update on public.product_variants
  for each row execute function private.check_product_variant();

-- The same rules seen from the product: it keeps its live variants valid when its kind or price changes.
create function private.check_variants_of_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.product_variants where product_id = new.id and deleted_at is null) then
    return new;
  end if;
  if new.fulfillment <> 'made_to_order' then
    raise exception 'a product with variants stays made to order' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.product_variants
    where product_id = new.id and deleted_at is null and round(new.price_usd * 100) + price_delta_usd_minor <= 0
  ) then
    raise exception 'a variant costs more than zero' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger products_variant_rules
  before update of fulfillment, price_usd on public.products
  for each row execute function private.check_variants_of_product();

revoke all on function private.check_product_variant() from public;
revoke all on function private.check_variants_of_product() from public;

-- The price a listing shows and filters by: the lowest price of the product's live variants that can be ordered,
-- else of its live variants, else the product's own price (a product without variants).
create function private.listing_price_usd(p_product_id uuid, p_price_usd numeric)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select min(p_price_usd + v.price_delta_usd_minor / 100.0)
     from public.product_variants v where v.product_id = p_product_id and v.deleted_at is null and v.is_available),
    (select min(p_price_usd + v.price_delta_usd_minor / 100.0)
     from public.product_variants v where v.product_id = p_product_id and v.deleted_at is null),
    p_price_usd
  );
$$;

revoke all on function private.listing_price_usd(uuid, numeric) from public;

-- Access -----------------------------------------------------------------------------------------------------

alter table public.product_variants enable row level security;
alter table public.product_variant_translations enable row level security;

revoke all on table public.product_variants, public.product_variant_translations from anon, authenticated;

-- the storefront columns; who wrote a row and the soft-delete mark are internal (as for products)
grant select (id, product_id, sku_suffix, price_delta_usd_minor, is_available, position, created_at, updated_at)
on table public.product_variants to anon, authenticated;
grant select on table public.product_variant_translations to anon, authenticated;

-- The subquery runs under the products policy: the public sees the variants of published products, an admin
-- those of every product (admin screens read through the service role anyway).
create policy "product_variants: live ones readable with their product"
  on public.product_variants for select to anon, authenticated
  using (deleted_at is null and exists (select 1 from public.products p where p.id = product_id));

create policy "product_variant_translations: readable with their variant"
  on public.product_variant_translations for select to anon, authenticated
  using (exists (select 1 from public.product_variants v where v.id = variant_id));

-- No write grants: only the admin functions below write variants.

-- Admin writes -----------------------------------------------------------------------------------------------
-- Each one checks the caller (an admin, or the server's service role), locks the product row so two writes to
-- one product's variants queue, and never touches a deleted product or variant. The audit trigger still takes
-- created_by / updated_by from the caller's JWT.

-- 50 variants per product: a technical bound far above any real size range.
create function private.assert_admin_writes_variants()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not ((select auth.jwt() ->> 'role') = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change product variants' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_admin_writes_variants() from public;

create function private.lock_live_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.products where id = p_product_id and deleted_at is null for update;
  if not found then
    raise exception 'product % not found', p_product_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function private.lock_live_product(uuid) from public;

-- Creates (p_variant_id null: as the last one) or updates a variant with its labels. p_variant:
-- { "sku_suffix": text | null, "price_delta_usd_minor": int, "is_available": bool }; p_labels: an array of
-- { "locale", "label", "source"? } that replaces the stored labels (at least one).
create function public.admin_save_product_variant(
  p_product_id uuid,
  p_variant_id uuid,
  p_variant jsonb,
  p_labels jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := p_variant_id;
  v_locales text[];
begin
  perform private.assert_admin_writes_variants();
  if jsonb_typeof(p_variant) is distinct from 'object' then
    raise exception 'variant must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_labels) is distinct from 'array' or jsonb_array_length(p_labels) = 0 then
    raise exception 'a variant needs a label' using errcode = '22023';
  end if;
  select array_agg(l ->> 'locale') into v_locales from jsonb_array_elements(p_labels) l;
  perform private.lock_live_product(p_product_id);

  if v_id is null then
    if (select count(*) from public.product_variants where product_id = p_product_id and deleted_at is null) >= 50 then
      raise exception 'too many variants' using errcode = '54000';
    end if;
    insert into public.product_variants (product_id, sku_suffix, price_delta_usd_minor, is_available, position)
    values (
      p_product_id,
      p_variant ->> 'sku_suffix',
      coalesce((p_variant ->> 'price_delta_usd_minor')::integer, 0),
      coalesce((p_variant ->> 'is_available')::boolean, true),
      coalesce(
        (select max(position) + 1 from public.product_variants where product_id = p_product_id and deleted_at is null),
        0
      )
    )
    returning id into v_id;
  else
    update public.product_variants set
      sku_suffix            = p_variant ->> 'sku_suffix',
      price_delta_usd_minor = coalesce((p_variant ->> 'price_delta_usd_minor')::integer, 0),
      is_available          = coalesce((p_variant ->> 'is_available')::boolean, true)
    where id = v_id and product_id = p_product_id and deleted_at is null;
    if not found then
      raise exception 'variant % not found', v_id using errcode = 'P0002';
    end if;
  end if;

  delete from public.product_variant_translations where variant_id = v_id and not (locale = any (v_locales));
  insert into public.product_variant_translations (variant_id, locale, label, source)
  select v_id, l.locale, btrim(l.label), coalesce(l.source, 'human')
  from jsonb_to_recordset(p_labels) as l (locale public.locale, label text, source public.translation_source)
  on conflict (variant_id, locale) do update set label = excluded.label, source = excluded.source;

  return v_id;
end;
$$;

-- One tap: a size the owner can make again, or not for now.
create function public.admin_set_product_variant_available(p_product_id uuid, p_variant_id uuid, p_available boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_writes_variants();
  perform private.lock_live_product(p_product_id);
  update public.product_variants set is_available = coalesce(p_available, true)
  where id = p_variant_id and product_id = p_product_id and deleted_at is null;
  return found;
end;
$$;

-- The new order of all of a product's live variants. A list that is not exactly them (one was added or deleted
-- meanwhile, e.g. in another tab) is refused.
create function public.admin_reorder_product_variants(p_product_id uuid, p_variant_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_writes_variants();
  perform private.lock_live_product(p_product_id);
  if cardinality(p_variant_ids) is distinct from (select count(distinct x) from unnest(p_variant_ids) x)
    or (select coalesce(array_agg(id order by id), '{}') from public.product_variants
        where product_id = p_product_id and deleted_at is null)
      is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(p_variant_ids) x) then
    raise exception 'the variants of product % changed', p_product_id using errcode = '40001';
  end if;
  update public.product_variants v
  set position = o.ord - 1
  from unnest(p_variant_ids) with ordinality as o (id, ord)
  where v.id = o.id and v.position is distinct from (o.ord - 1)::integer;
end;
$$;

-- Soft delete of a variant nobody ordered (the trigger refuses an ordered one with 23503); carts that hold it
-- show it as no longer available.
create function public.admin_delete_product_variant(p_product_id uuid, p_variant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_admin_writes_variants();
  perform private.lock_live_product(p_product_id);
  update public.product_variants set deleted_at = now()
  where id = p_variant_id and product_id = p_product_id and deleted_at is null;
  return found;
end;
$$;

-- Machine translations of the size names (the product's translation run, #19): [{ variant_id, locale, label }] of
-- the product's live sizes, saved as source = machine; a label already there is kept unless p_overwrite.
create function public.admin_save_variant_labels(p_product_id uuid, p_labels jsonb, p_overwrite boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_admin_writes_variants();
  if jsonb_typeof(p_labels) is distinct from 'array' then
    raise exception 'labels must be an array' using errcode = '22023';
  end if;
  perform private.lock_live_product(p_product_id);
  insert into public.product_variant_translations (variant_id, locale, label, source)
  select l.variant_id, l.locale, btrim(l.label), 'machine'
  from jsonb_to_recordset(p_labels) as l (variant_id uuid, locale public.locale, label text)
  join public.product_variants v on v.id = l.variant_id and v.product_id = p_product_id and v.deleted_at is null
  on conflict (variant_id, locale) do update set label = excluded.label, source = excluded.source
  where p_overwrite;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.admin_save_variant_labels(uuid, jsonb, boolean) from public, anon;
grant execute on function public.admin_save_variant_labels(uuid, jsonb, boolean) to authenticated, service_role;

revoke all on function public.admin_save_product_variant(uuid, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.admin_set_product_variant_available(uuid, uuid, boolean) from public, anon;
revoke all on function public.admin_reorder_product_variants(uuid, uuid[]) from public, anon;
revoke all on function public.admin_delete_product_variant(uuid, uuid) from public, anon;
grant execute on function public.admin_save_product_variant(uuid, uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.admin_set_product_variant_available(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.admin_reorder_product_variants(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.admin_delete_product_variant(uuid, uuid) to authenticated, service_role;

-- Cart -------------------------------------------------------------------------------------------------------
-- A line names its variant; the policies accept only a variant of the line's product that the shopper can see
-- (the subquery runs under the variants policy: live, of a published product). Whether a product needs a variant
-- and whether it can be ordered is the app's check, read fresh on every change.

alter table public.cart_items
  add constraint cart_items_variant_id_fkey foreign key (variant_id) references public.product_variants (id) on delete cascade;
create index cart_items_variant_id_idx on public.cart_items (variant_id);

drop policy "cart_items: owner inserts visible products" on public.cart_items;
drop policy "cart_items: owner updates visible products" on public.cart_items;

create policy "cart_items: owner inserts visible products"
  on public.cart_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id)
    and (variant_id is null
      or exists (select 1 from public.product_variants v where v.id = variant_id and v.product_id = cart_items.product_id))
  );
create policy "cart_items: owner updates visible products"
  on public.cart_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id)
    and (variant_id is null
      or exists (select 1 from public.product_variants v where v.id = variant_id and v.product_id = cart_items.product_id))
  );

-- Orders -----------------------------------------------------------------------------------------------------
-- The order line keeps the variant's label as the customer saw it (in the order's locale, or the fallback the
-- variant had) next to the reserved variant_id; the line's unit price already is the variant's price. Additive:
-- the notifications (#26) read these columns.

alter table public.order_items
  add column variant_label        text check (variant_label is null or (btrim(variant_label) <> '' and char_length(variant_label) <= 100)),
  add column variant_label_locale public.locale,
  add constraint order_items_variant_label_locale check ((variant_label is null) = (variant_label_locale is null)),
  add constraint order_items_variant_id_fkey foreign key (variant_id) references public.product_variants (id) on delete set null;

create index order_items_variant_id_idx on public.order_items (variant_id);

-- Two sizes of one product are two lines of one order; a product removed for good leaves its lines unlinked
-- (product_id and variant_id null), so the uniqueness only holds for linked lines.
alter table public.order_items drop constraint order_items_line_unique;
create unique index order_items_line_unique
  on public.order_items (order_id, product_id, variant_id) nulls not distinct where product_id is not null;

-- create_order_request (20261016007200) with variants: a line of a product that has live variants must name one
-- of them that can be ordered, and a line naming a variant must name a live one of its product; anything else is
-- refused like an unpublished product (the answer names its product, as before). The line's SKU is the product's
-- with the variant's suffix.
create or replace function public.create_order_request(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order       public.orders;
  v_item        jsonb;
  v_product     record;
  v_variant     record;
  v_product_id  uuid;
  v_variant_id  uuid;
  v_sku         text;
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
      user_id, idempotency_key, locale,
      first_name, last_name, phone, email, comment,
      country, delivery_carrier, delivery_method, delivery_destination,
      delivery_estimate_state, delivery_estimate_source, delivery_estimate_minor, delivery_estimate_currency,
      delivery_estimate_decimals, currency, currency_decimals, fx_rate, fx_rate_date, markup_bps,
      items_total_usd_minor, items_total_minor
    ) values (
      (p_order ->> 'user_id')::uuid,
      (p_order ->> 'idempotency_key')::uuid,
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
      (p_order ->> 'delivery_estimate_decimals')::smallint,
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
      v_variant_id := (v_item ->> 'variant_id')::uuid;
      select p.fulfillment, p.status, p.deleted_at, p.sku into v_product from public.products p where p.id = v_product_id;
      if not found or v_product.status <> 'published' or v_product.deleted_at is not null then
        v_unavailable := v_unavailable || v_product_id;
        continue;
      end if;

      v_sku := v_product.sku;
      if v_variant_id is null then
        if exists (select 1 from public.product_variants where product_id = v_product_id and deleted_at is null) then
          v_unavailable := v_unavailable || v_product_id;
          continue;
        end if;
      else
        select v.product_id, v.deleted_at, v.is_available, v.sku_suffix into v_variant
        from public.product_variants v where v.id = v_variant_id for share;
        if not found or v_variant.product_id <> v_product_id or v_variant.deleted_at is not null or not v_variant.is_available then
          v_unavailable := v_unavailable || v_product_id;
          continue;
        end if;
        if v_sku is not null and v_variant.sku_suffix is not null then
          v_sku := v_sku || '-' || v_variant.sku_suffix;
        end if;
      end if;

      if v_product.fulfillment = 'one_of_a_kind' and not private.reserve_one_of_a_kind(v_product_id) then
        v_unavailable := v_unavailable || v_product_id;
        continue;
      end if;

      insert into public.order_items (
        order_id, position, product_id, variant_id, sku, fulfillment, title, title_locale, variant_label,
        variant_label_locale, quantity, unit_price_usd_minor, unit_price_minor, line_total_usd_minor, line_total_minor
      ) values (
        v_order.id,
        (v_item ->> 'position')::smallint,
        v_product_id,
        v_variant_id,
        v_sku,
        v_product.fulfillment,
        v_item ->> 'title',
        (v_item ->> 'title_locale')::public.locale,
        case when v_variant_id is not null then v_item ->> 'variant_label' end,
        case when v_variant_id is not null then (v_item ->> 'variant_label_locale')::public.locale end,
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
    return jsonb_build_object(
      'ok', false, 'reason', 'unavailable', 'product_ids', to_jsonb(v_unavailable)
    );
  end;
end;
$$;

revoke all on function public.create_order_request(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_request(jsonb, jsonb) to service_role;

-- Load pg_trgm in this session first: on the hosted database (no superuser) the function below may only set
-- pg_trgm.word_similarity_threshold when the module is loaded (production failed with 42501 without this line).
select extensions.similarity('a', 'a');

-- Listings (shop_candidates of 20261016007500) -----------------------------------------------------------------
-- The listing filters and sorts by the price its cards show: a product with variants by its lowest variant price
-- (private.listing_price_usd, shown as "from …" when its variants differ in price). Otherwise unchanged.

create or replace function private.shop_candidates(
  p_locale public.locale,
  p_category text,
  p_terms text[],
  p_materials text[],
  p_colours text[],
  p_price_min_minor bigint,
  p_price_max_minor bigint,
  p_availability text[]
)
returns table (
  product_id uuid,
  rank real,
  created_at timestamptz,
  price_usd numeric,
  bucket text,
  material_ok boolean,
  colour_ok boolean,
  availability_ok boolean
)
language plpgsql
stable
-- the typo match: a title word at least half similar to the query (the default 0.6 misses "corol" → "coral")
set pg_trgm.word_similarity_threshold = 0.5
set search_path = ''
as $$
declare
  v_terms        text[] := coalesce(p_terms, '{}');
  v_materials    text[] := coalesce(p_materials, '{}');
  v_colours      text[] := coalesce(p_colours, '{}');
  v_availability text[] := coalesce(p_availability, '{}');
  v_text         text;
  v_tsq_locale   tsquery;
  v_tsq_en       tsquery;
begin
  if p_locale is null then
    raise exception 'locale is required' using errcode = '22023';
  end if;
  if cardinality(v_terms) > 8 or exists (select 1 from unnest(v_terms) t where t is null or length(t) not between 1 and 64) then
    raise exception 'invalid search terms' using errcode = '22023';
  end if;
  if cardinality(v_materials) > 50 or cardinality(v_colours) > 50 then
    raise exception 'too many filter values' using errcode = '22023';
  end if;
  if not v_availability <@ array['in_stock', 'made_to_order'] then
    raise exception 'invalid availability' using errcode = '22023';
  end if;
  if p_price_min_minor < 0 or p_price_max_minor < 0 then
    raise exception 'invalid price bounds' using errcode = '22023';
  end if;

  v_text := array_to_string(v_terms, ' ');
  v_tsq_locale := private.prefix_tsquery(private.search_config(p_locale), v_terms);
  v_tsq_en := private.prefix_tsquery('pg_catalog.english', v_terms);

  return query
  with matched as (
    -- the visitor's locale and the fallback en: a product matches through either translation, its own
    -- locale ranking higher; the three conditions each use an index (search vector, title trigrams). The
    -- rank adds the full-text rank to the title's word similarity, so a typo match (trigrams only, no
    -- full-text rank, similarity below 1) ranks below a match of the words themselves
    select t.product_id,
      max(
        -- ts_rank_cd is strict: no rank without a query (every term a stop word)
        (coalesce(pg_catalog.ts_rank_cd(t.search_vector, case when t.locale = p_locale then v_tsq_locale else v_tsq_en end), 0)
          + extensions.word_similarity(v_text, t.title))
        * case when t.locale = p_locale then 1.0 else 0.8 end
      )::real as rank
    from public.product_translations t
    where cardinality(v_terms) > 0
      and t.locale in (p_locale, 'en')
      and (
        (t.locale = p_locale and t.search_vector @@ v_tsq_locale)
        or (t.locale = 'en' and t.search_vector @@ v_tsq_en)
        or (length(v_text) >= 4 and t.title operator(extensions.%>) v_text)
      )
    group by t.product_id
  ),
  products as (
    select p.id, p.created_at, private.listing_price_usd(p.id, p.price_usd) as price_usd,
      case
        when p.fulfillment = 'made_to_order' then 'made_to_order'
        when p.availability = 'available' then 'in_stock'
      end as bucket,
      m.rank
    from public.products p
    join public.categories c on c.id = p.category_id
    left join matched m on m.product_id = p.id
    where p.status = 'published'
      and p.deleted_at is null
      and (p_category is null or c.slug = p_category)
      and (cardinality(v_terms) = 0 or m.product_id is not null)
      -- shown only with a translation in the locale or the fallback (as the storefront reads it)
      and exists (select 1 from public.product_translations t where t.product_id = p.id and t.locale in (p_locale, 'en'))
  )
  select p.id, p.rank, p.created_at, p.price_usd, p.bucket,
    cardinality(v_materials) = 0 or exists (
      select 1 from public.product_taxonomy_terms pt
      join public.taxonomy_terms tt on tt.id = pt.term_id
      where pt.product_id = p.id and tt.kind = 'material' and tt.slug = any (v_materials)
    ),
    cardinality(v_colours) = 0 or exists (
      select 1 from public.product_taxonomy_terms pt
      join public.taxonomy_terms tt on tt.id = pt.term_id
      where pt.product_id = p.id and tt.kind = 'colour' and tt.slug = any (v_colours)
    ),
    cardinality(v_availability) = 0 or p.bucket = any (v_availability)
  from products p
  where (p_price_min_minor is null or p.price_usd >= p_price_min_minor / 100.0)
    and (p_price_max_minor is null or p.price_usd <= p_price_max_minor / 100.0);
end;
$$;

revoke all on function private.shop_candidates(public.locale, text, text[], text[], text[], bigint, bigint, text[]) from public;
