"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { changeEmailAction, type EmailChangeResult } from "@/app/[locale]/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMAIL_MAX_LENGTH, emailChangeSchema } from "@/lib/account/schemas";

type Status = { kind: "sent"; email: string } | { kind: "error"; text: string; field?: boolean } | null;

/**
 * The email of the account, changed through Supabase Auth: the confirmation links go to the current and to the
 * new address, and the email changes once both are followed.
 */
export function EmailForm({ current, pending }: { current: string; pending: string | null }) {
  const t = useTranslations("account.email");
  const locale = useLocale();
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [isPending, startTransition] = useTransition();

  function failure(result: Exclude<EmailChangeResult, { ok: true }>): Status {
    switch (result.reason) {
      case "invalid":
        return { kind: "error", text: t("errors.invalid"), field: true };
      case "same":
        return { kind: "error", text: t("errors.same"), field: true };
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
    const input = { locale, email };
    if (!emailChangeSchema.safeParse(input).success) {
      setStatus({ kind: "error", text: t("errors.invalid"), field: true });
      return;
    }
    startTransition(async () => {
      const result = await changeEmailAction(input).catch((): EmailChangeResult => ({ ok: false, reason: "unexpectedError" }));
      if (result.ok) {
        setEmail("");
        setStatus({ kind: "sent", email: result.email });
      } else {
        setStatus(failure(result));
      }
    });
  }

  const fieldError = status?.kind === "error" && status.field;

  return (
    <form noValidate onSubmit={submit} className="grid gap-5" data-testid="email-form">
      <dl className="grid gap-1">
        <dt className="font-sans text-sm font-semibold">{t("current")}</dt>
        <dd className="font-input break-all" data-testid="current-email">
          {current}
        </dd>
      </dl>
      {pending && status?.kind !== "sent" ? (
        <p className="font-input text-sm" data-testid="pending-email">
          {t("pending", { email: pending })}
        </p>
      ) : null}
      <div className="grid gap-2 sm:max-w-md">
        <label htmlFor={`${id}-email`} className="font-sans text-sm font-semibold">
          {t("new")}
        </label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={EMAIL_MAX_LENGTH}
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status?.kind === "error") setStatus(null);
          }}
          aria-invalid={fieldError || undefined}
          aria-describedby={`${id}-hint${fieldError ? ` ${id}-error` : ""}`}
          className="text-base sm:text-sm"
        />
        <p id={`${id}-hint`} className="font-input text-xs text-foreground/70">
          {t("hint")}
        </p>
        {fieldError ? (
          <p id={`${id}-error`} className="font-input text-sm text-accent-text">
            {status.text}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="outline" disabled={isPending} aria-busy={isPending || undefined}>
          {isPending ? t("sending") : t("submit")}
        </Button>
        <p role="status" className="font-input text-sm" data-testid="email-status">
          {status?.kind === "sent" ? t("sent", { email: status.email }) : null}
        </p>
      </div>
      {status?.kind === "error" && !status.field ? (
        <p role="alert" className="border-2 border-accent p-3 font-input text-sm">
          {status.text}
        </p>
      ) : null}
    </form>
  );
}
