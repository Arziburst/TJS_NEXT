"use client";

import { useTranslations } from "next-intl";
import { startTransition, type ComponentProps, type FormEvent } from "react";
import type { ContactsFormState } from "@/app/[locale]/admin/settings/actions";
import {
  CONTACT_INPUT_MAX_LENGTH,
  SHOP_NAME_MAX_LENGTH,
  type ContactErrorCode,
  type ContactField,
} from "@/lib/settings/contacts";
import { useFormActionState } from "./form-action";
import { TextField } from "./form-fields";
import { SaveButton, SettingsFeedback } from "./settings-form-parts";

type ContactsFormProps = {
  values: Record<ContactField, string>;
  saveContacts: (previous: ContactsFormState, formData: FormData) => Promise<ContactsFormState>;
};

const idle: ContactsFormState = { status: "idle" };
const unexpected: ContactsFormState = { status: "error", error: "unexpectedError" };

// the keyboard each field needs on a phone; links and names are typed as they are, never auto-corrected
const INPUTS: Record<ContactField, ComponentProps<"input">> = {
  shopName: { autoComplete: "organization" },
  instagram: { autoCapitalize: "none", autoCorrect: "off", spellCheck: false },
  email: { type: "email", inputMode: "email", autoComplete: "email" },
  phone: { type: "tel", inputMode: "tel", autoComplete: "tel" },
  telegram: { autoCapitalize: "none", autoCorrect: "off", spellCheck: false },
  viber: { autoCapitalize: "none", autoCorrect: "off", spellCheck: false },
  whatsapp: { autoCapitalize: "none", autoCorrect: "off", spellCheck: false },
  telegramChatId: { inputMode: "text", autoCapitalize: "none", autoCorrect: "off", spellCheck: false },
};

const CHANNELS = ["instagram", "phone", "email", "telegram", "viber", "whatsapp"] as const satisfies readonly ContactField[];

/** The shop's name, its contact channels (D19) and the chat of the owner's notifications (D11). */
export function ContactsForm({ values, saveContacts }: ContactsFormProps) {
  const t = useTranslations("admin.settings.contacts");
  const [state, dispatch, pending] = useFormActionState(saveContacts, idle, unexpected);
  const fields = state.status === "error" ? (state.fields ?? {}) : {};
  // after a save the fields show what was stored (a link typed as @name comes back as https://t.me/name)
  const current = state.status === "saved" ? (state.values as Record<ContactField, string>) : values;
  const generation = state.status === "saved" ? state.savedAt : 0;

  function errorText(field: ContactField, code: ContactErrorCode | undefined): string | undefined {
    if (!code) return undefined;
    if (code === "tooLong") return t("tooLong", { max: field === "shopName" ? SHOP_NAME_MAX_LENGTH : CONTACT_INPUT_MAX_LENGTH });
    return t(`invalid.${field}`);
  }

  // submitted without React's form reset, so a refused save keeps every typed value
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  function field(name: ContactField) {
    return (
      <TextField
        key={`${name}-${generation}`}
        name={name}
        label={t(name)}
        hint={t(`${name}Hint`)}
        defaultValue={current[name]}
        maxLength={name === "shopName" ? SHOP_NAME_MAX_LENGTH : CONTACT_INPUT_MAX_LENGTH}
        error={errorText(name, fields[name])}
        {...INPUTS[name]}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="settings-contacts" aria-busy={pending} className="grid gap-5">
      <header className="grid gap-1">
        <h2 id="settings-contacts" className="font-sans text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="font-input text-sm">{t("hint")}</p>
      </header>
      <SettingsFeedback
        state={state}
        label={(name, code) => `${t(name as ContactField)}: ${errorText(name as ContactField, code as ContactErrorCode)}`}
      />
      <div className="grid gap-4 sb:grid-cols-2">
        {field("shopName")}
        {CHANNELS.map(field)}
      </div>
      <fieldset className="grid gap-4 sb:grid-cols-2">
        <legend className="mb-3 font-sans text-base font-semibold">{t("notifications")}</legend>
        {field("telegramChatId")}
      </fieldset>
      <SaveButton pending={pending} />
    </form>
  );
}
