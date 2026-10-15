-- Product photos from the admin (#18). A phone photo is larger than a Vercel function accepts (4.5 MB request
-- body), so the browser uploads it straight to Storage, into a private staging bucket, through a signed URL
-- that only an admin's Server Action can create. The server then checks the staged bytes (size, type by
-- content), drops their metadata, and writes the result to the public product-images bucket under a new path
-- through the admin's session; nothing unchecked ever becomes public.

-- 15 MiB per photo (a phone photo at full resolution), the same in both buckets.
update storage.buckets set file_size_limit = 15728640 where id = 'product-images';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-image-uploads',
  'product-image-uploads',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Each admin stages under a folder named after their user id. Signing an upload URL checks the insert policy
-- for the caller; no update: a staged file is never overwritten.
create policy "product-image-uploads: admins stage in their folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-image-uploads'
    and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "product-image-uploads: admins read their staged files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-image-uploads'
    and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "product-image-uploads: admins delete their staged files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-image-uploads'
    and (select public.is_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Admin writes ----------------------------------------------------------------------------------------------
-- Security invoker, like admin_save_product: the caller's RLS policies and grants decide, the explicit admin
-- check only gives a clear refusal. The product row is locked so two writes to one product's photos queue.

-- A new photo goes last; the first photo (lowest position) is the product's main photo.
create function public.admin_add_product_image(
  p_product_id uuid,
  p_storage_path text,
  p_width integer,
  p_height integer,
  p_blur_data_url text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins add product photos' using errcode = '42501';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product % not found', p_product_id using errcode = 'P0002';
  end if;
  insert into public.product_images (product_id, storage_path, position, width, height, blur_data_url)
  values (
    p_product_id, p_storage_path,
    coalesce((select max(position) + 1 from public.product_images where product_id = p_product_id), 0),
    p_width, p_height, p_blur_data_url
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- The new order of all of a product's photos (the first is the main one). A list that is not exactly the
-- product's photos (one was added or deleted meanwhile, e.g. in another tab) is refused.
create function public.admin_reorder_product_images(p_product_id uuid, p_image_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins order product photos' using errcode = '42501';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  if not found then
    raise exception 'product % not found', p_product_id using errcode = 'P0002';
  end if;
  if cardinality(p_image_ids) is distinct from (select count(distinct x) from unnest(p_image_ids) x)
    or (select coalesce(array_agg(id order by id), '{}') from public.product_images where product_id = p_product_id)
      is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(p_image_ids) x) then
    raise exception 'the photos of product % changed', p_product_id using errcode = '40001';
  end if;
  update public.product_images i
  set position = o.ord - 1
  from unnest(p_image_ids) with ordinality as o (id, ord)
  where i.id = o.id and i.position is distinct from (o.ord - 1)::integer;
end;
$$;

-- A photo's alt texts, all locales at once: the given ones replace the stored ones, a missing locale falls back
-- to the product's title on the storefront.
create function public.admin_save_image_alts(p_product_id uuid, p_image_id uuid, p_alts jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (current_user = 'service_role' or (select public.is_admin())) then
    raise exception 'only admins change alt texts' using errcode = '42501';
  end if;
  if jsonb_typeof(p_alts) is distinct from 'array' then
    raise exception 'alts must be an array' using errcode = '22023';
  end if;
  perform 1 from public.product_images where id = p_image_id and product_id = p_product_id;
  if not found then
    return false;
  end if;
  delete from public.product_image_alts where image_id = p_image_id;
  insert into public.product_image_alts (image_id, locale, alt)
  select p_image_id, a.locale, a.alt
  from jsonb_to_recordset(p_alts) as a (locale public.locale, alt text);
  return true;
end;
$$;

-- Supabase default privileges grant EXECUTE on new public functions to anon directly: revoke it explicitly.
revoke all on function public.admin_add_product_image(uuid, text, integer, integer, text) from public, anon;
revoke all on function public.admin_reorder_product_images(uuid, uuid[]) from public, anon;
revoke all on function public.admin_save_image_alts(uuid, uuid, jsonb) from public, anon;
grant execute on function public.admin_add_product_image(uuid, text, integer, integer, text) to authenticated, service_role;
grant execute on function public.admin_reorder_product_images(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.admin_save_image_alts(uuid, uuid, jsonb) to authenticated, service_role;
