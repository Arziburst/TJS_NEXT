import { getTranslations } from "next-intl/server";

/** The photos section of a product that is not saved yet: photos belong to a stored product. */
export async function PhotosAfterSave() {
  const t = await getTranslations("admin");
  return (
    <section aria-labelledby="admin-photos" className="grid gap-3">
      <h2 id="admin-photos" className="font-sans text-lg font-semibold">
        {t("form.sections.photos")}
      </h2>
      <p className="font-input text-sm">{t("images.saveFirst")}</p>
    </section>
  );
}
