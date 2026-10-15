-- Admin product management (#17): the lead time of made-to-order work becomes a range of days with an
-- optional per-locale note (D30), products get optional dimensions in millimetres and a per-locale clasp text
-- (D29), and the admin saves a product through functions that run as the caller, so RLS, the column grants
-- and the audit trigger (created_by / updated_by from the JWT) apply as for any other write.

-- Lead time: a range of days -----------------------------------------------------------------------------
-- The single lead_time_days becomes the lower bound (data and column grants are kept by the rename).

alter table public.products drop constraint products_lead_time_only_made_to_order;
alter table public.products rename column lead_time_days to lead_time_min_days;
alter table public.products rename constraint products_lead_time_days_check to products_lead_time_min_days_check;

alter table public.products
  add column lead_time_max_days integer check (lead_time_max_days > 0),
  add column length_mm numeric(6, 1) check (length_mm > 0),
  add column width_mm  numeric(6, 1) check (width_mm > 0),
  add column height_mm numeric(6, 1) check (height_mm > 0);

update public.products set lead_time_max_days = lead_time_min_days where lead_time_min_days is not null;

alter table public.products
  -- both bounds or none, the lower one first (a fixed time is min = max)
  add constraint products_lead_time_range
    check ((lead_time_min_days is null) = (lead_time_max_days is null) and lead_time_min_days <= lead_time_max_days),
  add constraint products_lead_time_only_made_to_order
    check (lead_time_min_days is null or fulfillment = 'made_to_order');

-- Per-locale texts: the lead time note and the clasp -------------------------------------------------------

alter table public.product_translations
  add column lead_time_note text check (btrim(lead_time_note) <> ''),
  add column clasp          text check (btrim(clasp) <> '');

-- The storefront reads the new columns (20261016001412 lists the readable ones column by column).
grant select (lead_time_max_days, length_mm, width_mm, height_mm) on table public.products to anon, authenticated;
grant select (lead_time_note, clasp) on table public.product_translations to anon, authenticated;

-- Admin writes ----------------------------------------------------------------------------------------------
-- Security invoker: the caller's RLS policies and grants decide, the explicit admin check only gives a clear
-- refusal. A product and its translations are saved in one transaction (one slug conflict rolls back all).
-- Publishing needs the Ukrainian translation (the shop's main market); the storefront falls back to en. The
-- rule lives here, not in a table constraint: fixtures and imports may publish other locales only. A
-- service-role script (an import) may call these too; it has no JWT, so created_by / updated_by stay null.

create function public.admin_save_product(p_id uuid, p_product jsonb, p_translations jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_status  public.product_status := (p_product ->> 'status')::public.product_status;
  v_locales text[];
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins save products' using errcode = '42501';
  end if;
  if jsonb_typeof(p_translations) is distinct from 'array' then
    raise exception 'translations must be an array' using errcode = '22023';
  end if;
  select coalesce(array_agg(t ->> 'locale'), '{}') into v_locales from jsonb_array_elements(p_translations) t;
  if v_status = 'published' and not ('uk' = any (v_locales)) then
    raise exception 'a published product needs its uk translation' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.products (
      category_id, sku, status, fulfillment, availability, lead_time_min_days, lead_time_max_days,
      price_usd, weight_g, length_mm, width_mm, height_mm, position
    ) values (
      (p_product ->> 'category_id')::uuid, p_product ->> 'sku', v_status,
      (p_product ->> 'fulfillment')::public.product_fulfillment,
      (p_product ->> 'availability')::public.product_availability,
      (p_product ->> 'lead_time_min_days')::integer, (p_product ->> 'lead_time_max_days')::integer,
      (p_product ->> 'price_usd')::numeric, (p_product ->> 'weight_g')::numeric,
      (p_product ->> 'length_mm')::numeric, (p_product ->> 'width_mm')::numeric, (p_product ->> 'height_mm')::numeric,
      coalesce((p_product ->> 'position')::integer, 0)
    )
    returning id into v_id;
  else
    update public.products set
      category_id        = (p_product ->> 'category_id')::uuid,
      sku                = p_product ->> 'sku',
      status             = v_status,
      fulfillment        = (p_product ->> 'fulfillment')::public.product_fulfillment,
      availability       = (p_product ->> 'availability')::public.product_availability,
      lead_time_min_days = (p_product ->> 'lead_time_min_days')::integer,
      lead_time_max_days = (p_product ->> 'lead_time_max_days')::integer,
      price_usd          = (p_product ->> 'price_usd')::numeric,
      weight_g           = (p_product ->> 'weight_g')::numeric,
      length_mm          = (p_product ->> 'length_mm')::numeric,
      width_mm           = (p_product ->> 'width_mm')::numeric,
      height_mm          = (p_product ->> 'height_mm')::numeric,
      position           = coalesce((p_product ->> 'position')::integer, 0)
    where id = v_id;
    if not found then
      raise exception 'product % not found', v_id using errcode = 'P0002';
    end if;
  end if;

  delete from public.product_translations where product_id = v_id and not (locale = any (v_locales));

  insert into public.product_translations (
    product_id, locale, slug, title, description, materials, care, clasp, lead_time_note,
    meta_title, meta_description, source
  )
  select v_id, t.locale, t.slug, t.title, t.description, t.materials, t.care, t.clasp, t.lead_time_note,
    t.meta_title, t.meta_description, coalesce(t.source, 'human')
  from jsonb_to_recordset(p_translations) as t (
    locale public.locale, slug text, title text, description text, materials text, care text, clasp text,
    lead_time_note text, meta_title text, meta_description text, source public.translation_source
  )
  on conflict (product_id, locale) do update set
    slug             = excluded.slug,
    title            = excluded.title,
    description      = excluded.description,
    materials        = excluded.materials,
    care             = excluded.care,
    clasp            = excluded.clasp,
    lead_time_note   = excluded.lead_time_note,
    meta_title       = excluded.meta_title,
    meta_description = excluded.meta_description,
    source           = excluded.source;

  return v_id;
end;
$$;

-- One tap in the product list: publish, unpublish (back to draft) or archive.
create function public.admin_set_product_status(p_id uuid, p_status public.product_status)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change products' using errcode = '42501';
  end if;
  if p_status = 'published'
    and not exists (select 1 from public.product_translations where product_id = p_id and locale = 'uk') then
    raise exception 'a published product needs its uk translation' using errcode = '23514';
  end if;
  update public.products set status = p_status where id = p_id;
  return found;
end;
$$;

-- Soft delete: the row stays for order history; RLS hides it from the storefront at once.
create function public.admin_delete_product(p_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins delete products' using errcode = '42501';
  end if;
  update public.products set deleted_at = now() where id = p_id;
  return found;
end;
$$;

revoke all on function public.admin_save_product(uuid, jsonb, jsonb) from public;
revoke all on function public.admin_set_product_status(uuid, public.product_status) from public;
revoke all on function public.admin_delete_product(uuid) from public;
grant execute on function public.admin_save_product(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_set_product_status(uuid, public.product_status) to authenticated;
grant execute on function public.admin_delete_product(uuid) to authenticated;
grant execute on function public.admin_save_product(uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_set_product_status(uuid, public.product_status) to service_role;
grant execute on function public.admin_delete_product(uuid) to service_role;
