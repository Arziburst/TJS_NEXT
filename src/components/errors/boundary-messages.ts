import type { Locale } from "@/i18n/routing";
import en from "../../../messages/en/errors.json";

export type BoundaryMessages = (typeof en)["boundary"];

/** English, in the bundle: the global error page's texts until (or if never) its locale's chunk arrives. */
export const fallbackBoundaryMessages: BoundaryMessages = en.boundary;

/*
 * The error page's texts in one locale, for the global error page (#112): it replaces the root layout, so no
 * message provider is above it and it cannot ask the server for them (the server may be what failed). Every
 * page loads the global error page's code, so the texts are a chunk per locale fetched only when it shows
 * (#105); English stands in if that chunk cannot be fetched.
 */
export async function loadBoundaryMessages(locale: Locale): Promise<BoundaryMessages> {
  try {
    const messages: { default: { boundary: BoundaryMessages } } = await import(`../../../messages/${locale}/errors.json`);
    return messages.default.boundary;
  } catch {
    return fallbackBoundaryMessages;
  }
}
