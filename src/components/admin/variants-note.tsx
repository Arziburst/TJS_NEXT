import { getTranslations } from "next-intl/server";

/**
 * The sizes section when there is nothing to edit (#66): a product not saved yet (sizes belong to a stored
 * product), a one-of-a-kind piece (it has none), or sizes that could not be read.
 */
export async function VariantsNote({ reason }: { reason: "saveFirst" | "oneOfAKind" | "loadError" }) {
  const t = await getTranslations("admin");
  return (
    <section aria-labelledby="admin-variants" className="grid gap-3" data-testid="admin-variants">
      <h2 id="admin-variants" className="font-sans text-lg font-semibold">
        {t("form.sections.variants")}
      </h2>
      <p role={reason === "loadError" ? "alert" : undefined} className="font-input text-sm">
        {reason === "loadError" ? t("variants.errors.unexpectedError") : t(`variants.${reason}`)}
      </p>
    </section>
  );
}
