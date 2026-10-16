import "server-only";

import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { currencies, isCurrency, type Currency } from "@/lib/money/currencies";
import {
  createPublicServerClient,
  createServiceClient,
  createSessionClient,
} from "@/lib/supabase/server";
import type { AboutContent } from "./about";
import type { PublicShopSettings, ShopSettingsRow } from "./contacts";
import type { CurrencyRule } from "./price-settings";

const PUBLIC_COLUMNS = "shop_name, instagram_handle, email, phone, telegram_url, viber_url, whatsapp_url";

/** The public settings as any visitor reads them (cacheable). Throws when the database is unreachable. */
export async function readPublicShopSettings(): Promise<PublicShopSettings> {
  const { data, error } = await createPublicServerClient().from("shop_settings").select(PUBLIC_COLUMNS).single();
  if (error) throw new Error(`shop_settings: ${error.message}`);
  return data;
}

/**
 * Every setting including the Telegram chat id, which no Data API role can read: through the service role, so
 * only for server code that has checked the admin itself (the settings page after requireAdmin(), the
 * notifications of #26). Null when the read fails.
 */
export async function readShopSettingsAsService(): Promise<ShopSettingsRow | null> {
  try {
    const { data, error } = await createServiceClient()
      .from("shop_settings")
      .select(`${PUBLIC_COLUMNS}, telegram_chat_id`)
      .single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

/** Each currency's decimals and rounding rule plus the markup (one for all, D28), for the admin page. */
export type AdminPriceSettings = {
  markupBps: number;
  currencies: { currency: Currency; decimals: number; rule: CurrencyRule }[];
};

export async function readAdminPriceSettings(): Promise<AdminPriceSettings | null> {
  try {
    const { data, error } = await createPublicServerClient()
      .from("currency_settings")
      .select("currency, decimals, markup_bps, round_increment, ending, small_price_below, small_round_increment, small_ending");
    if (error) return null;
    const rows = data
      .filter((row): row is typeof row & { currency: Currency } => isCurrency(row.currency))
      .sort((a, b) => currencies.indexOf(a.currency) - currencies.indexOf(b.currency));
    // the markup is one value since D28; an older row that differs shows the highest (never a lower price)
    const markupBps = Math.max(0, ...rows.map((row) => row.markup_bps));
    return {
      markupBps,
      currencies: rows.map((row) => ({
        currency: row.currency,
        decimals: row.decimals,
        rule: {
          roundIncrement: row.round_increment,
          ending: row.ending,
          smallPriceBelow: row.small_price_below,
          smallRoundIncrement: row.small_round_increment,
          smallEnding: row.small_ending,
        },
      })),
    };
  } catch {
    return null;
  }
}

type AboutRows = {
  published: boolean;
  translations: { locale: string; body_html: string; meta_description: string | null; source: "human" | "machine"; reviewed_at: string | null }[];
};

function toContent({ published, translations }: AboutRows): AboutContent {
  return {
    published,
    translations: translations.flatMap((row) =>
      hasLocale(routing.locales, row.locale)
        ? [
            {
              locale: row.locale,
              bodyHtml: row.body_html,
              metaDescription: row.meta_description,
              source: row.source,
              reviewedAt: row.reviewed_at,
            },
          ]
        : [],
    ),
  };
}

async function readAbout(client: ReturnType<typeof createPublicServerClient>): Promise<AboutContent> {
  const [page, translations] = await Promise.all([
    client.from("about_page").select("published").single(),
    client.from("about_translations").select("locale, body_html, meta_description, source, reviewed_at"),
  ]);
  if (page.error) throw new Error(`about_page: ${page.error.message}`);
  if (translations.error) throw new Error(`about_translations: ${translations.error.message}`);
  return toContent({ published: page.data.published, translations: translations.data });
}

/** The About page as a visitor reads it: its texts only once published (cacheable). Throws on a failed read. */
export function readPublicAbout(): Promise<AboutContent> {
  return readAbout(createPublicServerClient());
}

/** The About page with its unpublished drafts, read as the signed-in admin (RLS). Null when the read fails. */
export async function readAdminAbout(): Promise<AboutContent | null> {
  try {
    return await readAbout(await createSessionClient());
  } catch {
    return null;
  }
}
