"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { placeOrderAction } from "@/app/[locale]/checkout/actions";
import { ACCOUNT_ADDRESSES_HREF } from "@/components/account/paths";
import { InternationalDelivery, type NovaPostSelection } from "@/components/delivery/nova-post/international-delivery";
import { NovaPoshtaDelivery, type NovaPoshtaSelection } from "@/components/delivery/nova-poshta-delivery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import type { PlaceOrderResult } from "@/lib/checkout/place-order";
import {
  COMMENT_MAX_LENGTH,
  contactSchema,
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  type CheckoutField,
  type CheckoutInput,
  type ContactField,
  type DeliveryChoiceInput,
} from "@/lib/checkout/schema";
import type { DeliveryCountry } from "@/lib/delivery/nova-post/countries";
import type { OrderGoods } from "@/lib/delivery/nova-post/parcel";
import { cn } from "@/lib/utils";
import { orderDoneHref } from "./paths";
import { SavedDeliveryQuote } from "./saved-delivery-quote";

export type CheckoutCountry = "UA" | DeliveryCountry;

// A signed-in customer's saved destination (#28), described on the server
export type SavedDeliveryOption = {
  id: string;
  // the customer's name for it, else the service ("Nova Poshta branch")
  title: string;
  lines: [string, string];
  lang?: string;
  isDefault: boolean;
  choice: DeliveryChoiceInput;
};

type CheckoutFormProps = {
  countries: { code: CheckoutCountry; label: string }[];
  defaultCountry: CheckoutCountry | null;
  // a signed-in customer's profile; empty for a guest
  prefill: { firstName: string; lastName: string; phone: string; email: string };
  // a signed-in customer's saved destinations, the default one chosen at first; empty for a guest
  saved: SavedDeliveryOption[];
  // Ukraine: the cart's parcel for the Nova Poshta estimate (parcelFromCart on the server)
  parcel: { weightGrams: number; declaredValueMinor: number };
  // abroad: the cart's goods for the Nova Post estimate (goodsOf on the server)
  goods: OrderGoods | null;
  novaPostLive: boolean;
  // the lines shown in the summary: the server checks that the cart still holds exactly these, at these prices
  expected: { productId: string; variantId: string | null; quantity: number; unitUsdMinor: number }[];
  // the server-rendered total next to the button
  total: ReactNode;
};

const CONTACT_FIELDS = [
  { name: "firstName", type: "text", autoComplete: "given-name", maxLength: NAME_MAX_LENGTH, required: true },
  { name: "lastName", type: "text", autoComplete: "family-name", maxLength: NAME_MAX_LENGTH, required: false },
  { name: "phone", type: "tel", autoComplete: "tel", maxLength: 30, required: true },
  { name: "email", type: "email", autoComplete: "email", maxLength: EMAIL_MAX_LENGTH, required: true },
] as const satisfies readonly { name: ContactField; type: string; autoComplete: string; maxLength: number; required: boolean }[];

type FormError = { text: string; refresh?: boolean } | null;

function novaPoshtaChoice(selection: NovaPoshtaSelection): DeliveryChoiceInput {
  const city = { ref: selection.city.ref, cityRef: selection.city.cityRef, label: selection.city.label };
  if (selection.method === "warehouse") {
    const { ref, kind, number, name } = selection.warehouse;
    return { kind: "novaPoshtaWarehouse", city, warehouse: { ref, kind, number, name } };
  }
  return {
    kind: "novaPoshtaAddress",
    city,
    street: { ref: selection.street.ref, label: selection.street.label },
    house: selection.house,
    flat: selection.flat,
  };
}

function novaPostChoice(selection: NovaPostSelection): DeliveryChoiceInput {
  if (selection.kind === "division") {
    const { id, number, name, category, address } = selection.division;
    return {
      kind: "novaPostDivision",
      country: selection.country,
      settlement: { id: selection.settlement.id, name: selection.settlement.name },
      division: { id, number, name, category, address },
    };
  }
  return { kind: "novaPostAddress", country: selection.country, ...selection.address };
}

/*
 * The order request form (D19): contacts, the country and the delivery point with its estimate, a comment.
 * Mobile first, one column; errors are shown next to their fields and announced, and the first invalid field
 * gets the focus. The delivery pieces contain a form of their own (the address abroad), so this form's fields
 * sit outside the <form> element and join it through their `form` attribute.
 */
export function CheckoutForm({ countries, defaultCountry, prefill, saved, parcel, goods, novaPostLive, expected, total }: CheckoutFormProps) {
  const t = useTranslations("checkout");
  const tr = useTranslations("checkout.request");
  const tInt = useTranslations("checkout.internationalDelivery");
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const countryId = useId();
  const commentId = useId();
  const [attempt] = useState(() => crypto.randomUUID());
  const [contact, setContact] = useState(prefill);
  const savedName = useId();
  // a saved destination (the default one at first), or null for another address chosen below
  const [savedId, setSavedId] = useState<string | null>(() => (saved.find((option) => option.isDefault) ?? saved[0])?.id ?? null);
  const savedChoice = saved.find((option) => option.id === savedId) ?? null;
  const [country, setCountry] = useState<CheckoutCountry | null>(defaultCountry);
  const [novaPoshta, setNovaPoshta] = useState<NovaPoshtaSelection | null>(null);
  const [novaPost, setNovaPost] = useState<NovaPostSelection | null>(null);
  // a courier address abroad typed or edited but not calculated: the delivery error says to calculate it
  const [addressPending, setAddressPending] = useState(false);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, true>>>({});
  const [formError, setFormError] = useState<FormError>(null);
  const [placed, setPlaced] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fields = useRef(new Map<CheckoutField, HTMLElement | null>());
  // a second click before the button re-renders as busy sends nothing (the server is idempotent anyway)
  const sending = useRef(false);

  const delivery: DeliveryChoiceInput | null = savedChoice
    ? savedChoice.choice
    : country === "UA"
      ? novaPoshta && novaPoshtaChoice(novaPoshta)
      : country && novaPost
        ? novaPostChoice(novaPost)
        : null;
  // an error stays until its field changes; the delivery error until a destination is chosen
  const shown: Partial<Record<CheckoutField, true>> = delivery ? { ...errors, delivery: undefined } : errors;
  const invalidCount = Object.values(shown).filter(Boolean).length;

  function clearError(field: CheckoutField) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function focusFirst(invalid: readonly CheckoutField[]) {
    const order: CheckoutField[] = ["firstName", "lastName", "phone", "email", "delivery", "comment"];
    const first = order.find((field) => invalid.includes(field));
    if (first) fields.current.get(first)?.focus();
  }

  function validate(): CheckoutField[] {
    const invalid: CheckoutField[] = [];
    const parsed = contactSchema.safeParse(contact);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !invalid.includes(field as ContactField)) invalid.push(field as ContactField);
      }
    }
    if (!delivery) invalid.push("delivery");
    if (comment.trim().length > COMMENT_MAX_LENGTH) invalid.push("comment");
    return invalid;
  }

  function show(invalid: readonly CheckoutField[]) {
    setErrors(Object.fromEntries(invalid.map((field) => [field, true])));
    focusFirst(invalid);
  }

  function failure(result: Exclude<PlaceOrderResult, { ok: true }>): FormError {
    switch (result.reason) {
      case "invalid":
        show(result.fields);
        // only hidden parts were refused (the page is out of date): the generic error
        return result.fields.length > 0 ? null : { text: tr("errors.unexpected"), refresh: true };
      case "unavailable":
        // a refresh drops the refused pieces from the summary; when nothing else is left it would replace the
        // form (and this message) with the empty state, so the message naming them stays instead
        return {
          text: tr("errors.unavailable", { titles: result.titles.join(", ") }),
          refresh: result.titles.length < expected.length,
        };
      case "sizeUnavailable":
        return {
          text: tr("errors.sizeUnavailable", { titles: result.titles.join(", ") }),
          refresh: result.titles.length < expected.length,
        };
      case "cartChanged":
        return { text: tr("errors.cartChanged"), refresh: true };
      case "pricesChanged":
        return { text: tr("errors.pricesChanged"), refresh: true };
      case "emptyCart":
        return { text: tr("errors.emptyCart"), refresh: true };
      case "rateLimited":
        return { text: tr("errors.rateLimited") };
      case "pricesUnavailable":
        return { text: tr("errors.pricesUnavailable") };
      case "unexpectedError":
        return { text: tr("errors.unexpected") };
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || placed) return;
    const invalid = validate();
    setFormError(null);
    if (invalid.length > 0 || !delivery) {
      show(invalid);
      return;
    }
    setErrors({});
    const input: CheckoutInput = { attempt, locale: locale as CheckoutInput["locale"], contact, delivery, comment, expected };
    sending.current = true;
    startTransition(async () => {
      const result = await placeOrderAction(input).catch((): PlaceOrderResult => ({ ok: false, reason: "unexpectedError" }));
      sending.current = false;
      if (result.ok) {
        setPlaced(true);
        router.replace(orderDoneHref(result.number));
        return;
      }
      const next = failure(result);
      setFormError(next);
      if (next?.refresh) router.refresh();
    });
  }

  function errorProps(field: CheckoutField, describedBy?: string) {
    const errorId = `${formId}-${field}-error`;
    const ids = [describedBy, shown[field] ? errorId : null].filter(Boolean).join(" ");
    return { "aria-invalid": shown[field] ? true : undefined, "aria-describedby": ids || undefined };
  }

  function fieldError(field: CheckoutField) {
    if (!shown[field]) return null;
    return (
      <p id={`${formId}-${field}-error`} className="font-input text-sm text-accent-text">
        {field === "delivery" && country !== "UA" && addressPending ? tr("errors.deliveryAddress") : tr(`errors.${field}`)}
      </p>
    );
  }

  const busy = isPending || placed;

  return (
    <div className="grid gap-10" data-slot="checkout-form">
      <form id={formId} noValidate onSubmit={submit} aria-labelledby={`${formId}-contact`} className="grid gap-5">
        <h2 id={`${formId}-contact`} className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
          {t("contactDetails")}
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {CONTACT_FIELDS.map((field) => {
            const id = `${formId}-${field.name}`;
            const hintId = field.name === "phone" ? `${id}-hint` : undefined;
            return (
              <div key={field.name} className="grid content-start gap-2">
                <label htmlFor={id} className="font-sans text-sm font-semibold">
                  {tr(`contact.${field.name}`)}
                </label>
                <Input
                  ref={(element) => {
                    fields.current.set(field.name, element);
                  }}
                  id={id}
                  name={field.name}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  maxLength={field.maxLength}
                  required={field.required}
                  value={contact[field.name]}
                  onChange={(event) => {
                    setContact((current) => ({ ...current, [field.name]: event.target.value }));
                    clearError(field.name);
                  }}
                  className="text-base sm:text-sm"
                  {...errorProps(field.name, hintId)}
                />
                {hintId ? (
                  <p id={hintId} className="font-input text-xs text-foreground/70">
                    {tr("contact.phoneHint")}
                  </p>
                ) : null}
                {fieldError(field.name)}
              </div>
            );
          })}
        </div>
      </form>

      <section aria-labelledby={`${formId}-shipping`} className="grid gap-5">
        <h2 id={`${formId}-shipping`} className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
          {t("shippingDetails")}
        </h2>
        {saved.length > 0 ? (
          <fieldset className="grid gap-2" data-testid="saved-addresses">
            <legend className="mb-2 font-sans text-sm font-semibold">{tr("saved.label")}</legend>
            {[...saved, null].map((option) => {
              const value = option?.id ?? "";
              const checked = (savedId ?? "") === value;
              return (
                <label
                  key={value || "other"}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 border-2 border-input px-3 py-2 font-input text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                    checked && "border-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={savedName}
                    value={value}
                    checked={checked}
                    onChange={() => {
                      setSavedId(option?.id ?? null);
                      clearError("delivery");
                    }}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  {option ? (
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-sans font-semibold break-words">
                        {option.title}
                        {option.isDefault ? <span className="ml-2 text-xs font-medium uppercase">{tr("saved.default")}</span> : null}
                      </span>
                      <span lang={option.lang} className="break-words">
                        {option.lines[0]}
                      </span>
                      <span lang={option.lang} className="text-xs break-words">
                        {option.lines[1]}
                      </span>
                    </span>
                  ) : (
                    <span className="font-sans font-semibold">{tr("saved.other")}</span>
                  )}
                </label>
              );
            })}
            <Link href={ACCOUNT_ADDRESSES_HREF} className="w-fit text-sm underline underline-offset-4 hover:text-accent-text">
              {tr("saved.manage")}
            </Link>
          </fieldset>
        ) : null}

        {savedChoice ? (
          <SavedDeliveryQuote choice={savedChoice.choice} parcel={parcel} goods={goods} />
        ) : (
          <>
            <div className="grid gap-2">
              <label htmlFor={countryId} className="font-sans text-sm font-semibold">
                {tInt("country")}
              </label>
              <select
                ref={(element) => {
                  fields.current.set("delivery", element);
                }}
                id={countryId}
                value={country ?? ""}
                onChange={(event) => {
                  const next = countries.find((option) => option.code === event.target.value);
                  if (!next) return;
                  setCountry(next.code);
                  setNovaPoshta(null);
                  setNovaPost(null);
                  setAddressPending(false);
                }}
                className="h-11 w-full cursor-pointer rounded-none border-2 border-input bg-transparent px-2.5 font-input text-base text-foreground transition outline-none hover:opacity-70 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-accent sm:text-sm"
                {...errorProps("delivery")}
              >
                <option value="" disabled>
                  {tInt("countryPlaceholder")}
                </option>
                {countries.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {country === "UA" ? (
              <NovaPoshtaDelivery parcel={parcel} onChange={setNovaPoshta} />
            ) : country ? (
              <InternationalDelivery
                key={country}
                countries={countries.filter((option): option is { code: DeliveryCountry; label: string } => option.code !== "UA")}
                live={novaPostLive}
                goods={goods}
                fixedCountry={country}
                onChange={setNovaPost}
                onAddressPendingChange={setAddressPending}
              />
            ) : null}
          </>
        )}
        {fieldError("delivery")}
      </section>

      <div className="grid gap-5">
        <div className="grid gap-2">
          <label htmlFor={commentId} className="font-sans text-sm font-semibold">
            {t("fields.comment")}
          </label>
          <p id={`${commentId}-hint`} className="-mt-1 font-input text-xs text-foreground/70">
            {tr("commentHint")}
          </p>
          <textarea
            ref={(element) => {
              fields.current.set("comment", element);
            }}
            id={commentId}
            form={formId}
            name="comment"
            rows={4}
            maxLength={COMMENT_MAX_LENGTH}
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
              clearError("comment");
            }}
            className="w-full rounded-none border-2 border-input bg-transparent p-2.5 font-input text-base text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-accent sm:text-sm"
            {...errorProps("comment", `${commentId}-hint`)}
          />
          {fieldError("comment")}
        </div>

        {total}

        {formError || invalidCount > 0 ? (
          <p role="alert" className="border-2 border-accent p-3 font-input text-sm" data-testid="checkout-error">
            {formError?.text ?? tr("errors.title")}
          </p>
        ) : null}

        <Button type="submit" form={formId} disabled={busy} aria-busy={busy || undefined} className="w-full sm:w-auto sm:justify-self-start">
          {busy ? tr("sending") : tr("submit")}
        </Button>
      </div>
    </div>
  );
}
