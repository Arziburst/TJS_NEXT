"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { updateProfileAction, type ProfileResult } from "@/app/[locale]/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NAME_MAX_LENGTH, profileSchema, type ProfileField } from "@/lib/account/schemas";

const FIELDS = [
  { name: "firstName", type: "text", autoComplete: "given-name", maxLength: NAME_MAX_LENGTH, required: true },
  { name: "lastName", type: "text", autoComplete: "family-name", maxLength: NAME_MAX_LENGTH, required: false },
  { name: "phone", type: "tel", autoComplete: "tel", maxLength: 30, required: false },
] as const satisfies readonly { name: ProfileField; type: string; autoComplete: string; maxLength: number; required: boolean }[];

type Values = Record<ProfileField, string>;
type Status = { kind: "saved" } | { kind: "error"; text: string } | null;

/** The customer's names and phone: what the order request form is filled in with. */
export function ProfileForm({ initial }: { initial: Values }) {
  const t = useTranslations("account.profile");
  const locale = useLocale();
  const formId = useId();
  const [values, setValues] = useState(initial);
  const [invalid, setInvalid] = useState<ProfileField[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [isPending, startTransition] = useTransition();
  const inputs = useRef(new Map<ProfileField, HTMLInputElement | null>());

  function show(fields: ProfileField[]) {
    setInvalid(fields);
    if (fields[0]) inputs.current.get(fields[0])?.focus();
  }

  function failure(result: Exclude<ProfileResult, { ok: true }>): Status {
    switch (result.reason) {
      case "invalid":
        show(result.fields);
        return null;
      case "rateLimited":
        return { kind: "error", text: t("errors.rateLimited") };
      case "signedOut":
        return { kind: "error", text: t("errors.signedOut") };
      case "unexpectedError":
        return { kind: "error", text: t("errors.unexpected") };
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const input = { locale, ...values };
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      const named = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      show(FIELDS.map((field) => field.name).filter((name) => named.has(name)));
      return;
    }
    setInvalid([]);
    startTransition(async () => {
      const result = await updateProfileAction(input).catch((): ProfileResult => ({ ok: false, reason: "unexpectedError" }));
      setStatus(result.ok ? { kind: "saved" } : failure(result));
    });
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-5" data-testid="profile-form">
      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map((field) => {
          const id = `${formId}-${field.name}`;
          const hintId = field.name === "phone" ? `${id}-hint` : null;
          const errorId = `${id}-error`;
          const isInvalid = invalid.includes(field.name);
          return (
            <div key={field.name} className="grid content-start gap-2">
              <label htmlFor={id} className="font-sans text-sm font-semibold">
                {t(field.name)}
              </label>
              <Input
                ref={(element) => {
                  inputs.current.set(field.name, element);
                }}
                id={id}
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                maxLength={field.maxLength}
                required={field.required}
                value={values[field.name]}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [field.name]: event.target.value }));
                  setInvalid((current) => current.filter((name) => name !== field.name));
                  setStatus(null);
                }}
                aria-invalid={isInvalid || undefined}
                aria-describedby={[hintId, isInvalid ? errorId : null].filter(Boolean).join(" ") || undefined}
                className="text-base sm:text-sm"
              />
              {hintId ? (
                <p id={hintId} className="font-input text-xs text-foreground/70">
                  {t("phoneHint")}
                </p>
              ) : null}
              {isInvalid ? (
                <p id={errorId} className="font-input text-sm text-accent-text">
                  {t(`errors.${field.name}`)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={isPending} aria-busy={isPending || undefined}>
          {isPending ? t("saving") : t("save")}
        </Button>
        <p role="status" className="font-input text-sm" data-testid="profile-status">
          {status?.kind === "saved" ? t("saved") : null}
        </p>
      </div>
      {status?.kind === "error" ? (
        <p role="alert" className="border-2 border-accent p-3 font-input text-sm">
          {status.text}
        </p>
      ) : null}
    </form>
  );
}
