"use client";

import { useTranslations } from "next-intl";
import { useId, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AddressValue = { city: string; postCode: string; street: string; building: string; flat: string };

// The limits of the API's addressParts; the Server Action checks them again
const FIELDS = [
  { name: "city", maxLength: 100, autoComplete: "address-level2", required: true },
  { name: "postCode", maxLength: 10, autoComplete: "postal-code", required: true },
  { name: "street", maxLength: 100, autoComplete: "address-line1", required: true },
  { name: "building", maxLength: 100, autoComplete: "off", required: true },
  { name: "flat", maxLength: 10, autoComplete: "address-line2", required: false },
] as const satisfies readonly { name: keyof AddressValue; maxLength: number; autoComplete: string; required: boolean }[];

type AddressFormProps = {
  // the town picked in the settlement search, filled in and still editable
  defaultCity?: string;
  pending?: boolean;
  onSubmit: (address: AddressValue) => void;
  className?: string;
};

// The delivery address abroad for a courier delivery; submitting asks for the delivery estimate
export function AddressForm({ defaultCity, pending = false, onSubmit, className }: AddressFormProps) {
  const t = useTranslations("checkout.internationalDelivery.address");
  const id = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: keyof AddressValue) => String(data.get(name) ?? "").trim();
    onSubmit({ city: text("city"), postCode: text("postCode"), street: text("street"), building: text("building"), flat: text("flat") });
  }

  return (
    <form onSubmit={submit} className={cn("grid gap-4 sm:grid-cols-2", className)} aria-busy={pending || undefined}>
      {FIELDS.map((field) => (
        <div key={field.name} className={cn("grid gap-2", field.name === "street" && "sm:col-span-2")}>
          <label htmlFor={`${id}-${field.name}`} className="font-sans text-sm font-semibold">
            {t(field.name)}
          </label>
          <Input
            id={`${id}-${field.name}`}
            name={field.name}
            required={field.required}
            maxLength={field.maxLength}
            autoComplete={field.autoComplete}
            defaultValue={field.name === "city" ? defaultCity : undefined}
          />
        </div>
      ))}
      <Button type="submit" disabled={pending} className="sm:col-span-2 sm:justify-self-start">
        {t("submit")}
      </Button>
    </form>
  );
}
