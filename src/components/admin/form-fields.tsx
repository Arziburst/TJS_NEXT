"use client";

import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import {
  SKU_MAX_LENGTH,
  TEXT_LIMITS,
  TRANSLATION_FIELDS,
  type FieldErrorCode,
  type TranslationField,
} from "@/lib/admin/product-form";
import { cn } from "@/lib/utils";
import { inputClass, labelClass, textareaClass } from "./styles";

/** The DOM id of a form field (`tr.uk.title` -> `field-tr-uk-title`); the error summary links to it. */
export function fieldId(name: string): string {
  return `field-${name.replaceAll(".", "-")}`;
}

function maxLengthOf(name: string): number | undefined {
  if (name === "sku") return SKU_MAX_LENGTH;
  const field = name.split(".")[2];
  return (TRANSLATION_FIELDS as readonly string[]).includes(field) ? TEXT_LIMITS[field as TranslationField] : undefined;
}

/** The message of a field error code. */
export function useFieldErrorText(): (name: string, code: FieldErrorCode | undefined) => string | undefined {
  const t = useTranslations("admin.form.errors");
  return (name, code) => {
    if (code === undefined) return undefined;
    if (code === "tooLong") return t("tooLong", { max: maxLengthOf(name) ?? 0 });
    return t(code);
  };
}

type FieldShellProps = {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (aria: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
};

/** A label, its control, a hint and an error, wired for screen readers (aria-invalid + aria-describedby). */
export function FieldShell({ name, label, hint, error, className, children }: FieldShellProps) {
  const id = fieldId(name);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy || undefined })}
      {hint && (
        <p id={`${id}-hint`} className="font-input text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 font-input text-sm">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<ComponentProps<"input">, "id" | "name"> & {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

export function TextField({ name, label, hint, error, wrapperClassName, className, ...props }: TextFieldProps) {
  return (
    <FieldShell name={name} label={label} hint={hint} error={error} className={wrapperClassName}>
      {(aria) => <input name={name} maxLength={maxLengthOf(name)} className={cn(inputClass, className)} {...aria} {...props} />}
    </FieldShell>
  );
}

type TextAreaFieldProps = Omit<ComponentProps<"textarea">, "id" | "name"> & {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

export function TextAreaField({ name, label, hint, error, wrapperClassName, className, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell name={name} label={label} hint={hint} error={error} className={wrapperClassName}>
      {(aria) => (
        <textarea name={name} maxLength={maxLengthOf(name)} className={cn(textareaClass, className)} {...aria} {...props} />
      )}
    </FieldShell>
  );
}

type ChoiceProps = {
  name: string;
  legend: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/** A radio group as large tiles: one tap per choice, native radios underneath (keyboard and screen readers). */
export function ChoiceField({ name, legend, options, value, onChange, error }: ChoiceProps) {
  const id = fieldId(name);
  return (
    <fieldset className="grid gap-1.5" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className={cn(labelClass, "mb-1.5")}>{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-2" id={id} tabIndex={-1}>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-12 cursor-pointer items-center justify-center border-2 border-input px-3 text-center font-sans text-sm font-semibold transition has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 font-input text-sm">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      )}
    </fieldset>
  );
}
