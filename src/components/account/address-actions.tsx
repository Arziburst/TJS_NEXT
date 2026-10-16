"use client";

import { StarIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteAddressAction, makeDefaultAddressAction, type AddressResult } from "@/app/[locale]/account/actions";
import { Button } from "@/components/ui/button";
import { SAVED_ADDRESSES_MAX } from "@/lib/account/schemas";

/** "Make default" and "Delete" of one saved address; the page re-renders from the server after each. */
export function AddressActions({ id, name, isDefault }: { id: string; name: string; isDefault: boolean }) {
  const t = useTranslations("account.addresses");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: (input: { id: string }) => Promise<AddressResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action({ id }).catch((): AddressResult => ({ ok: false, reason: "unexpectedError" }));
      if (result.ok) return;
      setError(
        result.reason === "notFound"
          ? t("errors.notFound")
          : result.reason === "rateLimited"
            ? t("errors.rateLimited")
            : result.reason === "signedOut"
              ? t("errors.signedOut")
              : result.reason === "limitReached"
                ? t("errors.limitReached", { max: SAVED_ADDRESSES_MAX })
                : t("errors.unexpected"),
      );
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {isDefault ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={isPending}
            aria-label={t("makeDefaultLabel", { name })}
            onClick={() => run(makeDefaultAddressAction)}
          >
            <StarIcon aria-hidden />
            {t("makeDefault")}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={isPending}
          aria-label={t("deleteLabel", { name })}
          onClick={() => run(deleteAddressAction)}
        >
          <Trash2Icon aria-hidden />
          {t("delete")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="font-input text-sm text-accent-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
