import { z } from "zod";
import { usdTextToMinor } from "@/lib/catalog/mappers";
import { BUSINESS_TIME_ZONE } from "@/lib/money/business-date";

/*
 * The admin's sale form (#67), shared by the form (its field checks) and the Server Actions (which validate
 * everything again). A product's sale is a percentage off or a fixed sale price in USD; a collection's a percentage.
 * Its window is entered as Kyiv wall-clock time (the shop's business time zone, whatever the browser's or the
 * server's zone), either end optional. No "server-only": pure.
 */

export const SALE_KINDS = ["percent", "price"] as const;
export type SaleKind = (typeof SALE_KINDS)[number];

export type SaleTarget = "product" | "collection";

/** A stored sale as the admin sees it: its window as instants (ISO), null when open. */
export type AdminSale = {
  kind: SaleKind;
  percentOff: number | null;
  priceUsdMinor: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Where it stood when it was read. */
  state: SaleState;
};

export const saleFormInput = z.object({
  kind: z.enum(SALE_KINDS),
  percent: z.string().trim().max(10),
  price: z.string().trim().max(20),
  startsAt: z.string().trim().max(20),
  endsAt: z.string().trim().max(20),
});

export type SaleFormInput = z.infer<typeof saleFormInput>;

export type SaleFieldError = "required" | "invalid" | "notBelowPrice" | "endBeforeStart" | "collectionPercentOnly";
export type SaleFieldErrors = Partial<Record<"percent" | "price" | "startsAt" | "endsAt" | "kind", SaleFieldError>>;

/** The row the database stores (instants in UTC). */
export type SaleWrite = { percent_off: number | null; price_usd_minor: number | null; starts_at: string | null; ends_at: string | null };

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// the offset of Kyiv from UTC at `instant`, in ms
function kyivOffset(instant: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** "2026-10-20T10:00" Kyiv time → the instant (ISO, UTC); null for anything else. */
export function kyivLocalToInstant(value: string): string | null {
  const match = LOCAL.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // the offset at the guess, then again at the result (a clock change in between)
  let instant = wall - kyivOffset(wall);
  instant = wall - kyivOffset(instant);
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** An instant → its Kyiv wall-clock time for a datetime-local field ("2026-10-20T10:00"). */
export function instantToKyivLocal(iso: string): string {
  const instant = Date.parse(iso);
  const local = new Date(instant + kyivOffset(instant));
  return local.toISOString().slice(0, 16);
}

/** "29.90" → 2990 cents, above zero; null otherwise. */
function priceMinor(text: string): number | null {
  const minor = usdTextToMinor(text.replace(",", "."));
  return minor !== null && minor > 0 && minor <= 1_000_000_000 ? minor : null;
}

export type ParsedSale = { ok: true; sale: SaleWrite } | { ok: false; fields: SaleFieldErrors };

/**
 * The sale to store, or the fields to fix. A fixed sale price must be below the product's regular price
 * (`regularUsdMinor`); a collection's sale is a percentage.
 */
export function parseSaleForm(input: SaleFormInput, target: SaleTarget, regularUsdMinor: number | null): ParsedSale {
  const fields: SaleFieldErrors = {};
  let percent: number | null = null;
  let price: number | null = null;
  if (target === "collection" && input.kind !== "percent") fields.kind = "collectionPercentOnly";
  if (input.kind === "percent") {
    if (input.percent === "") fields.percent = "required";
    else if (!/^\d{1,2}$/.test(input.percent) || +input.percent < 1 || +input.percent > 99) fields.percent = "invalid";
    else percent = +input.percent;
  } else {
    if (input.price === "") fields.price = "required";
    else {
      price = priceMinor(input.price);
      if (price === null) fields.price = "invalid";
      else if (regularUsdMinor !== null && price >= regularUsdMinor) fields.price = "notBelowPrice";
    }
  }
  const startsAt = input.startsAt === "" ? null : kyivLocalToInstant(input.startsAt);
  const endsAt = input.endsAt === "" ? null : kyivLocalToInstant(input.endsAt);
  if (input.startsAt !== "" && startsAt === null) fields.startsAt = "invalid";
  if (input.endsAt !== "" && endsAt === null) fields.endsAt = "invalid";
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) fields.endsAt = "endBeforeStart";
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, sale: { percent_off: percent, price_usd_minor: price, starts_at: startsAt, ends_at: endsAt } };
}

export type SaleState = "running" | "scheduled" | "ended";

/** Where a sale stands at `now`. */
export function saleState(sale: { startsAt: string | null; endsAt: string | null }, now: number): SaleState {
  if (sale.endsAt !== null && Date.parse(sale.endsAt) <= now) return "ended";
  if (sale.startsAt !== null && Date.parse(sale.startsAt) > now) return "scheduled";
  return "running";
}
