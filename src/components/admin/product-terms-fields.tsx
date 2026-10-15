import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AdminTerm } from "@/lib/admin/taxonomy";
import { PRODUCT_TERMS_FIELD, TAXONOMY_KINDS } from "@/lib/admin/taxonomy-form";
import { labelClass } from "./styles";
import { ADMIN_ATTRIBUTES_HREF } from "./paths";

type ProductTermsFieldsProps = {
  /** null: the lists could not be read (the form then saves the product without touching its terms). */
  terms: AdminTerm[] | null;
  selected: readonly string[];
};

/**
 * The product form's materials and colours (#25): one tile per term, several per list (native checkboxes
 * underneath). The lists are managed on their own admin page; an empty list links there.
 */
export async function ProductTermsFields({ terms, selected }: ProductTermsFieldsProps) {
  const [t, tTaxonomy] = await Promise.all([getTranslations("admin.form"), getTranslations("admin.taxonomy")]);

  return (
    <fieldset className="grid gap-4" data-testid="product-terms">
      <legend className="mb-3 font-sans text-lg font-semibold">{t("sections.taxonomy")}</legend>
      {terms === null ? (
        <p role="alert" className="border-2 border-destructive p-3 font-input text-sm">
          {tTaxonomy("loadError")}
        </p>
      ) : (
        <>
          {/* tells the action that the lists were shown: a missing field then means "none ticked" */}
          <input type="hidden" name={`${PRODUCT_TERMS_FIELD}-shown`} value="1" />
          {TAXONOMY_KINDS.map((kind) => {
            const options = terms.filter((term) => term.kind === kind);
            return (
              <fieldset key={kind} className="grid gap-1.5">
                <legend className={`${labelClass} mb-1.5`}>{tTaxonomy(`kinds.${kind}`)}</legend>
                {options.length === 0 ? (
                  <p className="font-input text-sm">{tTaxonomy(`empty.${kind}`)}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {options.map((term) => (
                      <label
                        key={term.id}
                        className="flex min-h-11 cursor-pointer items-center border-2 border-input px-3 font-sans text-sm font-semibold transition has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                      >
                        <input
                          type="checkbox"
                          name={PRODUCT_TERMS_FIELD}
                          value={term.id}
                          defaultChecked={selected.includes(term.id)}
                          className="sr-only"
                        />
                        {term.name}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            );
          })}
          <Link href={ADMIN_ATTRIBUTES_HREF} className="justify-self-start font-sans text-sm underline underline-offset-4 hover:text-accent-text">
            {t("manageTerms")}
          </Link>
        </>
      )}
    </fieldset>
  );
}
