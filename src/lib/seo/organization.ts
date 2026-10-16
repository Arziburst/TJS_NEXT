import { routes } from "@/config/routes";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ShopContacts } from "@/lib/settings/contacts";

const SCHEMA = "https://schema.org";

/** The shop's contact channels from the admin settings; each one only when the admin has set it. */
export type OrganizationContacts = {
  email?: string | null;
  telephone?: string | null;
  /** Profile URLs (Instagram …). */
  sameAs?: readonly string[];
};

/**
 * The Organization's contacts from the shop's settings (#21): the email, the phone as written, and the public
 * profiles (Instagram, a Telegram channel or user) as sameAs; chat links of Viber and WhatsApp are not profiles.
 */
export function organizationContacts(shop: ShopContacts | null): OrganizationContacts | undefined {
  if (!shop) return undefined;
  const contacts: OrganizationContacts = { sameAs: [] };
  for (const channel of shop.channels) {
    if (channel.kind === "email") contacts.email = channel.text;
    else if (channel.kind === "phone") contacts.telephone = channel.text;
    else if (channel.kind === "instagram" || channel.kind === "telegram") contacts.sameAs = [...(contacts.sameAs ?? []), channel.href];
  }
  return contacts;
}

export type SiteJsonLdInput = {
  /** The origin every URL is absolute on (getMetadataBase()). */
  base: URL;
  locale: Locale;
  name: string;
  description: string;
  contacts?: OrganizationContacts;
};

/*
 * The Organization and WebSite (with its sitelinks search box: SearchAction to /search?q=) nodes of the home
 * page. The Organization's ids are the same in every locale, so the 11 home pages describe one shop.
 * Shipping and return policies (hasMerchantReturnPolicy, shippingDetails) are not stated: their terms are not
 * decided yet (docs/decisions.md), and a policy in structured data is a promise to the buyer.
 */
export function siteJsonLd({ base, locale, name, description, contacts }: SiteJsonLdInput): Record<string, unknown> {
  const absolute = (path: string) => new URL(path, base).href;
  const home = absolute(getPathname({ href: routes.home.path, locale }));
  const organizationId = absolute("/#organization");

  const organization: Record<string, unknown> = {
    "@type": "Organization",
    "@id": organizationId,
    name,
    url: home,
  };
  if (contacts?.email) organization.email = contacts.email;
  if (contacts?.telephone) organization.telephone = contacts.telephone;
  if (contacts?.sameAs && contacts.sameAs.length > 0) organization.sameAs = [...contacts.sameAs];

  const searchPath = getPathname({ href: routes.search.path, locale });
  const website = {
    "@type": "WebSite",
    "@id": `${home}#website`,
    url: home,
    name,
    description,
    inLanguage: locale,
    publisher: { "@id": organizationId },
    potentialAction: {
      "@type": "SearchAction",
      // the placeholder's braces must survive: never URL-encoded
      target: { "@type": "EntryPoint", urlTemplate: `${absolute(searchPath)}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  return { "@context": SCHEMA, "@graph": [organization, website] };
}
