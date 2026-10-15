import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { AdminImage } from "@/lib/admin/products";

/** The product's photos, read only: uploading and ordering them comes with #18. */
export async function ProductPhotos({ images }: { images: AdminImage[] }) {
  const t = await getTranslations("admin.form");
  return (
    <section aria-labelledby="admin-photos" className="grid gap-3">
      <h2 id="admin-photos" className="font-sans text-lg font-semibold">
        {t("sections.photos")}
      </h2>
      <p className="font-input text-xs">{t("photosReadOnly")}</p>
      {images.length === 0 ? (
        <p className="font-input text-sm">{t("noPhotos")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sb:grid-cols-6">
          {images.map((image, index) => (
            <li key={image.id} className="relative aspect-square overflow-hidden bg-muted">
              <Image
                src={image.url}
                alt={t("photoAlt", { index: index + 1 })}
                fill
                sizes="(min-width: 1024px) 128px, 33vw"
                quality={75}
                className="object-cover"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
