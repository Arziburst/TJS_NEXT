"use client";

import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type FieldErrorCode,
} from "@/lib/auth/limits";
import { cn } from "@/lib/utils";
import type { FormErrorCode } from "../form-state";

/** The message of a field error code, with its limit filled in. */
export function useFieldErrorText(): (code: FieldErrorCode | undefined) => string | undefined {
  const t = useTranslations("errors.form");
  return (code) => {
    switch (code) {
      case undefined:
        return undefined;
      case "nameMinLength":
        return t("nameMinLength", { min: NAME_MIN_LENGTH });
      case "nameMaxLength":
        return t("nameMaxLength", { max: NAME_MAX_LENGTH });
      case "passwordMinLength":
        return t("passwordMinLength", { min: PASSWORD_MIN_LENGTH });
      case "passwordMaxLength":
        return t("passwordMaxLength", { max: PASSWORD_MAX_LENGTH });
      default:
        return t(code);
    }
  };
}

type FieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  name: string;
  error?: string;
};

/** A labelled input; an error is announced with the field (aria-invalid + aria-describedby). */
export function Field({ label, name, error, className, ...props }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={cn("grid gap-2", className)}>
      <label htmlFor={id} className="font-sans text-sm font-semibold">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 font-input text-sm">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The form-level error, read out when it appears. */
export function FormError({ code }: { code: FormErrorCode | undefined }) {
  const t = useTranslations("auth.errors");
  return (
    <div role="alert" className="empty:hidden">
      {code ? (
        <p className="flex items-start gap-2 border-2 border-destructive p-3 font-input text-sm">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {t(code)}
        </p>
      ) : null}
    </div>
  );
}

export function FormSuccess({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="grid gap-2 border-2 border-success p-4 font-input text-sm">
      <p className="flex items-center gap-2 font-sans text-base font-semibold">
        <CircleCheckIcon aria-hidden className="size-5 shrink-0 text-success" />
        {title}
      </p>
      <p>{children}</p>
    </div>
  );
}

export function SubmitButton({
  children,
  className,
  variant,
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-disabled={pending} className={cn("w-full", className)}>
      {children}
    </Button>
  );
}
