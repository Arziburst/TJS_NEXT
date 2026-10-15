-- The Data API roles read only the storefront columns of the catalog: who created or changed a row, the
-- soft-delete mark and the HS code are internal; the SKU is public (an article number, used in the Product
-- JSON-LD). Column grants replace the table-wide SELECT; RLS still decides which rows. anon and
-- authenticated include the admin, so admin screens read the internal columns on the server through the
-- service role after requireAdmin(), never through these grants.

revoke select on table public.categories, public.products, public.product_translations, public.product_images
from anon, authenticated;

grant select (id, slug, position, created_at, updated_at)
on table public.categories to anon, authenticated;

grant select (
  id, category_id, sku, status, fulfillment, availability, lead_time_days, price_usd, weight_g, position,
  published_at, created_at, updated_at
)
on table public.products to anon, authenticated;

grant select (
  product_id, locale, slug, title, description, materials, care, alt_text, meta_title, meta_description,
  source, reviewed_at, search_vector, created_at, updated_at
)
on table public.product_translations to anon, authenticated;

grant select (id, product_id, storage_path, position, width, height, blur_data_url, created_at, updated_at)
on table public.product_images to anon, authenticated;
