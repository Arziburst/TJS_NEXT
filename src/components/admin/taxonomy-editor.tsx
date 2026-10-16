"use client";

import { ChevronDownIcon, CircleAlertIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "@/components/layout/toast";
import type { DeleteTermResult, SaveTermState } from "@/app/[locale]/admin/attributes/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Locale } from "@/i18n/routing";
import { EDITOR_LOCALES, PUBLISH_LOCALE } from "@/lib/admin/product-form";
import type { AdminTerm } from "@/lib/admin/taxonomy";
import { TERM_NAME_MAX_LENGTH, termNameField } from "@/lib/admin/taxonomy-form";
import type { TaxonomyKind } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { useFormActionState } from "./form-action";
import { fieldId } from "./form-fields";
import { inputClass, labelClass } from "./styles";

type Actions = {
  saveTerm: (previous: SaveTermState, formData: FormData) => Promise<SaveTermState>;
  deleteTerm: (input: { id: string }) => Promise<DeleteTermResult>;
};

const idle: SaveTermState = { status: "idle" };
const unexpected: SaveTermState = { status: "error", error: "unexpectedError" };
// the first two locales are always open; the rest behind "Other languages"
const MAIN_LOCALES = EDITOR_LOCALES.slice(0, 2);
const OTHER_LOCALES = EDITOR_LOCALES.slice(2);

type TermFormProps = Pick<Actions, "saveTerm"> & { kind: TaxonomyKind; term: AdminTerm | null; idPrefix: string };

/** A term's names in every locale (uk required); creates a new term when `term` is null. */
function TermForm({ kind, term, saveTerm, idPrefix }: TermFormProps) {
  const t = useTranslations("admin.taxonomy");
  const tLocales = useTranslations("nav.localeNames");
  const [state, dispatch, pending] = useFormActionState(saveTerm, idle, unexpected);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "saved") return;
    toast.success(t(state.created ? "created" : "saved"));
    if (state.created) formRef.current?.reset();
  }, [state, t]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  const fields = state.status === "error" ? (state.fields ?? {}) : {};
  const nameInput = (locale: Locale) => {
    const name = termNameField(locale);
    const id = `${idPrefix}-${fieldId(name)}`;
    const error = fields[name];
    return (
      <div key={locale} className="grid content-start gap-1.5">
        <label htmlFor={id} className={labelClass}>
          {t("nameIn", { language: tLocales(locale) })}
          {locale === PUBLISH_LOCALE && <span className="font-input text-xs font-normal"> {t("required")}</span>}
        </label>
        <input
          id={id}
          name={name}
          defaultValue={term?.names[locale] ?? ""}
          maxLength={TERM_NAME_MAX_LENGTH}
          lang={locale}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClass}
        />
        {error && (
          <p id={`${id}-error`} className="flex items-start gap-1.5 font-input text-sm">
            <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            {t(`errors.${error}`, { max: TERM_NAME_MAX_LENGTH })}
          </p>
        )}
      </div>
    );
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={pending} className="grid gap-4">
      <input type="hidden" name="id" value={term?.id ?? ""} />
      <input type="hidden" name="kind" value={kind} />
      {state.status === "error" && state.error && (
        <p role="alert" className="flex items-start gap-2 border-2 border-destructive p-3 font-input text-sm">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {t(`errors.${state.error}`, { max: TERM_NAME_MAX_LENGTH })}
        </p>
      )}
      <div className="grid gap-4 sb:grid-cols-2">{MAIN_LOCALES.map(nameInput)}</div>
      <details className="group border-2 border-hairline">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 font-sans text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          {t("otherLocales")}
          <ChevronDownIcon aria-hidden className="size-5 shrink-0 transition group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 border-t-2 border-hairline p-3 sb:grid-cols-2">{OTHER_LOCALES.map(nameInput)}</div>
      </details>
      <Button type="submit" disabled={pending} className="justify-self-start sb:min-w-40">
        {pending ? t("saving") : term ? t("save") : t("create")}
      </Button>
    </form>
  );
}

function DeleteTermButton({ term, deleteTerm }: { term: AdminTerm } & Pick<Actions, "deleteTerm">) {
  const t = useTranslations("admin.taxonomy");
  const [open, setOpen] = useState(false);
  const [pending, startDelete] = useTransition();

  function confirm() {
    startDelete(async () => {
      const result = await deleteTerm({ id: term.id });
      if (!result.ok) {
        toast.error(t(`errors.${result.reason}`, { max: TERM_NAME_MAX_LENGTH }));
        return;
      }
      setOpen(false);
      toast.success(t("deleted", { name: term.name }));
    });
  }

  if (term.usedBy > 0) {
    return <p className="font-input text-xs">{t("inUseHint")}</p>;
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="destructive" size="sm" className="min-h-11 justify-self-start" />}>
        <Trash2Icon aria-hidden />
        {t("delete")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle", { name: term.name })}</DialogTitle>
          <DialogDescription>{t("deleteDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
            {t("deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TaxonomyListProps = Actions & { kind: TaxonomyKind; terms: AdminTerm[] };

/**
 * One list (materials or colours): the form to add a term, then every term as a disclosure with its names,
 * how many products use it and, when none does, its delete button. Mobile first, like the product form.
 */
export function TaxonomyList({ kind, terms, saveTerm, deleteTerm }: TaxonomyListProps) {
  const t = useTranslations("admin.taxonomy");
  const headingId = `taxonomy-${kind}`;

  return (
    <section aria-labelledby={headingId} className="grid gap-4" data-testid={`taxonomy-${kind}`}>
      <h2 id={headingId} className="font-sans text-lg font-semibold">
        {t(`kinds.${kind}`)}
      </h2>
      <details className="group border-2 border-primary">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 font-sans text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          {t(`add.${kind}`)}
          <ChevronDownIcon aria-hidden className="size-5 shrink-0 transition group-open:rotate-180" />
        </summary>
        <div className="border-t-2 border-primary p-3">
          <TermForm kind={kind} term={null} saveTerm={saveTerm} idPrefix={`new-${kind}`} />
        </div>
      </details>
      {terms.length === 0 ? (
        <p className="font-input text-sm">{t(`empty.${kind}`)}</p>
      ) : (
        <ul className="grid gap-2">
          {terms.map((term) => (
            <li key={term.id}>
              <details className={cn("group border-2 border-hairline")}>
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 font-sans text-base font-semibold break-words">{term.name}</span>
                  <span className="font-input text-xs">{t("usedBy", { count: term.usedBy })}</span>
                  <ChevronDownIcon aria-hidden className="size-5 shrink-0 transition group-open:rotate-180" />
                </summary>
                <div className="grid gap-4 border-t-2 border-hairline p-3">
                  <p className="font-input text-xs">{t("slug", { slug: term.slug })}</p>
                  <TermForm kind={kind} term={term} saveTerm={saveTerm} idPrefix={`term-${term.id}`} />
                  <DeleteTermButton term={term} deleteTerm={deleteTerm} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
