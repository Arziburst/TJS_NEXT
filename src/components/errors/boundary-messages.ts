import type { Locale } from "@/i18n/routing";
import cs from "../../../messages/cs/errors.json";
import de from "../../../messages/de/errors.json";
import en from "../../../messages/en/errors.json";
import es from "../../../messages/es/errors.json";
import fr from "../../../messages/fr/errors.json";
import it from "../../../messages/it/errors.json";
import nl from "../../../messages/nl/errors.json";
import pl from "../../../messages/pl/errors.json";
import pt from "../../../messages/pt/errors.json";
import ro from "../../../messages/ro/errors.json";
import uk from "../../../messages/uk/errors.json";

/*
 * The error page's texts in every locale, for the global error page (#112): it replaces the root layout, so
 * no message provider is above it and it cannot ask the server for them (the server may be what failed).
 */
export const boundaryMessages: Record<Locale, (typeof en)["boundary"]> = {
  uk: uk.boundary,
  en: en.boundary,
  de: de.boundary,
  fr: fr.boundary,
  es: es.boundary,
  it: it.boundary,
  pl: pl.boundary,
  nl: nl.boundary,
  cs: cs.boundary,
  pt: pt.boundary,
  ro: ro.boundary,
};
