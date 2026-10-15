"use client";

import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fieldId } from "./form-fields";

type SettingsState =
  | { status: "idle" }
  | { status: "error"; error?: "notAuthorized" | "unexpectedError"; fields?: Partial<Record<string, string>> }
  | { status: "saved"; savedAt: number };

/**
 * The outcome of a settings form's save: a toast when it was saved, and on a refusal a summary on top that
 * takes the focus and links each field error to its field.
 */
export function SettingsFeedback({ state, label }: { state: SettingsState; label: (name: string, code: string) => string }) {
  const t = useTranslations("admin.settings");
  const summaryRef = useRef<HTMLDivElement>(null);
  // each outcome is announced once: the page's refresh after a save renders the form again with the same state
  const announced = useRef<SettingsState | null>(null);

  useEffect(() => {
    if (announced.current === state) return;
    announced.current = state;
    if (state.status === "error") summaryRef.current?.focus();
    if (state.status === "saved") toast.success(t("saved"));
  }, [state, t]);

  const fields = state.status === "error" ? Object.entries(state.fields ?? {}).filter((entry): entry is [string, string] => !!entry[1]) : [];

  return (
    <div ref={summaryRef} tabIndex={-1} role="alert" className="outline-none empty:hidden">
      {state.status === "error" && (
        <div className="grid gap-2 border-2 border-destructive p-3 font-input text-sm">
          <p className="flex items-start gap-2 font-semibold">
            <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            {state.error ? t(`errors.${state.error}`) : t("errorSummary", { count: fields.length })}
          </p>
          {fields.length > 0 && (
            <ul className="grid gap-1 pl-6">
              {fields.map(([name, code]) => (
                <li key={name}>
                  <a href={`#${fieldId(name)}`} className="underline underline-offset-4">
                    {label(name, code)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function SaveButton({ pending }: { pending: boolean }) {
  const t = useTranslations("admin.settings");
  return (
    <div>
      <Button type="submit" disabled={pending} className="w-full sb:w-auto sb:min-w-48">
        {pending ? t("saving") : t("save")}
      </Button>
    </div>
  );
}
