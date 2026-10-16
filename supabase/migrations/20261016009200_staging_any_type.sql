-- #92: the private staging bucket takes a file whatever type the browser claims for it. A phone may send a
-- valid photo with an empty or unknown type (no extension, a renamed file); the bucket refused it before the
-- server could read its bytes. The server decides by the magic bytes (PNG, JPEG, WebP) when it finishes the
-- upload, and only a checked, re-encoded photo reaches the public product-images bucket, whose type list stays.
-- The bucket stays private, admin-only per folder, at most 15 MiB per file.
update storage.buckets set allowed_mime_types = null where id = 'product-image-uploads';
