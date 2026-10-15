-- Storage bucket for product photos: public read through public URLs, writes by admins only,
-- raster image types only (no SVG: it can carry scripts), at most 5 MiB per file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
);

-- Public buckets serve /object/public/... without RLS; the API select policy is for admins, who need
-- it to list, overwrite (upsert) and delete.
create policy "product-images: admins read through the API"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product-images: admins upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product-images: admins update"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy "product-images: admins delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
