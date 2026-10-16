"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useEffect, useState, type FormEvent } from "react";
import type { AboutFieldErrors, AboutFormState } from "@/app/[locale]/admin/settings/actions";
import type { Locale } from "@/i18n/routing";
import { ABOUT_EDITOR_LOCALES, ABOUT_PUBLISH_LOCALE, type AboutContent } from "@/lib/settings/about";
import { cn } from "@/lib/utils";
import { useFormActionState } from "./form-action";
import { ChoiceField, FieldShell, fieldId } from "./form-fields";
import { RichTextEditor } from "./rich-text-editor";
import { SaveButton, SettingsFeedback } from "./settings-form-parts";
import { textareaClass } from "./styles";

type AboutFormProps = {
  content: AboutContent;
  saveAbout: (previous: AboutFormState, formData: FormData) => Promise<AboutFormState>;
};

const idle: AboutFormState = { status: "idle" };
const unexpected: AboutFormState = { status: "error", error: "unexpectedError" };
const META_MAX_LENGTH = 500;

function bodyName(locale: Locale): string {
  return `about.${locale}.body`;
}

function metaName(locale: Locale): string {
  return `about.${locale}.meta`;
}

function localesWithErrors(fields: AboutFieldErrors | undefined): Locale[] {
  return ABOUT_EDITOR_LOCALES.filter((locale) => Object.keys(fields ?? {}).some((key) => key.startsWith(`about.${locale}.`)));
}

/**
 * The About page's texts, one disclosure per locale (uk first: required to publish), and whether the page is
 * published. After a save each editor shows exactly what the server kept.
 */
export function AboutForm({ content, saveAbout }: AboutFormProps) {
  const t = useTranslations("admin.settings.about");
  const tStatus = useTranslations("admin.status");
  const tLocales = useTranslations("nav.localeNames");
  const [state, dispatch, pending] = useFormActionState(saveAbout, idle, unexpected);
  const [published, setPublished] = useState(content.published ? "published" : "draft");
  const [openLocales, setOpenLocales] = useState<ReadonlySet<Locale>>(() => new Set([ABOUT_PUBLISH_LOCALE]));
  const [filled, setFilled] = useState<ReadonlySet<Locale>>(() => new Set(content.translations.map((tr) => tr.locale)));
  const fields: AboutFieldErrors = state.status === "error" ? (state.fields ?? {}) : {};
  const generation = state.status === "saved" ? state.savedAt : 0;
  const stored = new Map(content.translations.map((tr) => [tr.locale, tr]));

  useEffect(() => {
    if (state.status === "error") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the locales the server rejected
      setOpenLocales((open) => new Set([...open, ...localesWithErrors(state.fields)]));
    }
    if (state.status === "saved") setFilled(new Set(Object.keys(state.texts) as Locale[]));
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  function bodyOf(locale: Locale): string {
    if (state.status === "saved") return state.texts[locale]?.body ?? "";
    return stored.get(locale)?.bodyHtml ?? "";
  }

  function metaOf(locale: Locale): string {
    if (state.status === "saved") return state.texts[locale]?.meta ?? "";
    return stored.get(locale)?.metaDescription ?? "";
  }

  function errorText(name: string): string | undefined {
    const code = fields[name];
    return code ? t(`errors.${code}`) : undefined;
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} className="grid gap-5">
      <SettingsFeedback
        state={state}
        label={(name) => {
          const [, locale, field] = name.split(".");
          return `${field === "meta" ? t("metaDescription") : t("text")} (${tLocales(locale as Locale)}): ${errorText(name)}`;
        }}
      />

      <ChoiceField
        name="published"
        legend={t("state")}
        options={[
          { value: "draft", label: tStatus("draft") },
          { value: "published", label: tStatus("published") },
        ]}
        value={published}
        onChange={setPublished}
      />

      <div className="grid gap-3">
        {ABOUT_EDITOR_LOCALES.map((locale) => {
          const hasErrors = localesWithErrors(fields).includes(locale);
          const id = fieldId(bodyName(locale));
          const labelId = `${id}-label`;
          const bodyError = errorText(bodyName(locale));
          return (
            <details
              key={locale}
              open={openLocales.has(locale)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setOpenLocales((current) => {
                  const next = new Set(current);
                  if (open) next.add(locale);
                  else next.delete(locale);
                  return next;
                });
              }}
              className={cn("group border-2 border-hairline", hasErrors && "border-destructive")}
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <span className="font-sans text-base font-semibold" lang={locale}>
                  {tLocales(locale)}
                </span>
                <span className="flex flex-1 flex-wrap items-center gap-x-2 font-input text-xs">
                  {filled.has(locale) ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckIcon aria-hidden className="size-4 text-success" />
                      {t("filled")}
                    </span>
                  ) : (
                    <span>{locale === ABOUT_PUBLISH_LOCALE ? t("requiredToPublish") : t("empty")}</span>
                  )}
                  {hasErrors && (
                    <span className="font-semibold underline decoration-destructive decoration-2 underline-offset-4">{t("hasErrors")}</span>
                  )}
                </span>
                <ChevronDownIcon aria-hidden className="size-5 shrink-0 transition group-open:rotate-180" />
              </summary>
              <div className="grid gap-4 border-t-2 border-hairline p-3">
                <div className="grid gap-1.5">
                  <p id={labelId} className="font-sans text-sm font-semibold">
                    {t("text")}
                  </p>
                  <RichTextEditor
                    key={`${locale}-${generation}`}
                    id={id}
                    name={bodyName(locale)}
                    initialHtml={bodyOf(locale)}
                    labelledBy={labelId}
                    describedBy={[`${id}-hint`, bodyError ? `${id}-error` : null].filter(Boolean).join(" ")}
                    invalid={!!bodyError}
                    lang={locale}
                    onTextChange={(hasText) =>
                      setFilled((current) => {
                        if (current.has(locale) === hasText) return current;
                        const next = new Set(current);
                        if (hasText) next.add(locale);
                        else next.delete(locale);
                        return next;
                      })
                    }
                  />
                  <p id={`${id}-hint`} className="font-input text-xs">
                    {t("editorHint")}
                  </p>
                  {bodyError && (
                    <p id={`${id}-error`} className="font-input text-sm">
                      {bodyError}
                    </p>
                  )}
                </div>
                <FieldShell
                  name={metaName(locale)}
                  label={t("metaDescription")}
                  hint={t("metaDescriptionHint")}
                  error={errorText(metaName(locale))}
                >
                  {(aria) => (
                    <textarea
                      key={`${locale}-meta-${generation}`}
                      name={metaName(locale)}
                      defaultValue={metaOf(locale)}
                      maxLength={META_MAX_LENGTH}
                      lang={locale}
                      className={cn(textareaClass, "min-h-20")}
                      {...aria}
                    />
                  )}
                </FieldShell>
              </div>
            </details>
          );
        })}
      </div>
      <SaveButton pending={pending} />
    </form>
  );
}
