"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import type { OrderNoteActionResult } from "@/app/[locale]/admin/orders/actions";
import { Button } from "@/components/ui/button";
import { ORDER_NOTE_MAX_LENGTH } from "@/lib/admin/order-status";
import { labelClass, textareaClass } from "./styles";

type OrderNoteFormProps = {
  number: number;
  addOrderNote: (input: { number: number; body: string }) => Promise<OrderNoteActionResult>;
};

/** Adds an internal note to the order; the page shows it in the list above once saved. */
export function OrderNoteForm({ number, addOrderNote }: OrderNoteFormProps) {
  const t = useTranslations("admin.orders.detail");
  const tErrors = useTranslations("admin.orders.errors");
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text) {
      field.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await addOrderNote({ number, body: text });
      if (result.ok) {
        setBody("");
        toast.success(t("noteAdded"));
      } else {
        toast.error(tErrors(result.reason));
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <label htmlFor={id} className={labelClass}>
        {t("noteLabel")}
      </label>
      <textarea
        ref={field}
        id={id}
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={ORDER_NOTE_MAX_LENGTH}
        required
        className={textareaClass}
      />
      <Button type="submit" disabled={pending || body.trim() === ""} className="justify-self-start">
        {t("addNote")}
      </Button>
    </form>
  );
}
