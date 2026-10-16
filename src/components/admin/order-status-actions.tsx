"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "@/components/layout/toast";
import type { OrderStatusActionResult } from "@/app/[locale]/admin/orders/actions";
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
import { canCancel, nextStatus, type AdminOrderStatus, type OrderStatus } from "@/lib/admin/order-status";

type OrderStatusActionsProps = {
  number: number;
  status: OrderStatus;
  changeOrderStatus: (input: { number: number; from: OrderStatus; to: AdminOrderStatus }) => Promise<OrderStatusActionResult>;
};

/**
 * The quick status buttons of an order (D17): one tap to its next step, and cancel behind a confirmation (it
 * puts the order's one-of-a-kind pieces back on sale and tells the customer). The server checks the
 * transition again; a change made meanwhile elsewhere refreshes the page instead.
 */
export function OrderStatusActions({ number, status, changeOrderStatus }: OrderStatusActionsProps) {
  const t = useTranslations("admin.orders.actions");
  const tStatus = useTranslations("admin.orderStatus");
  const tErrors = useTranslations("admin.orders.errors");
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  // the forward steps of D17 (the database refuses any other)
  const next = nextStatus(status) as "in_processing" | "accepted" | "closed" | null;
  const cancelable = canCancel(status);

  function change(to: AdminOrderStatus) {
    startTransition(async () => {
      const result = await changeOrderStatus({ number, from: status, to });
      if (result.ok) {
        setConfirming(false);
        toast.success(t("changed", { number, status: tStatus(to) }));
      } else {
        toast.error(tErrors(result.reason));
      }
    });
  }

  if (!next && !cancelable) {
    return <p className="font-input text-sm">{t("final", { status: tStatus(status) })}</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {next && (
          <Button type="button" disabled={pending} onClick={() => change(next)} className="min-h-12 flex-1 sb:flex-none">
            {t(`to.${next}`)}
          </Button>
        )}
        {cancelable && (
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogTrigger render={<Button type="button" variant="outline" disabled={pending} className="min-h-12 flex-1 sb:flex-none" />}>
              {t("to.canceled")}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("cancelTitle", { number })}</DialogTitle>
                <DialogDescription>{t("cancelDescription")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>{t("keep")}</DialogClose>
                <Button type="button" variant="destructive" disabled={pending} onClick={() => change("canceled")}>
                  {t("cancelConfirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {next && <p className="font-input text-sm">{t(`hint.${next}`)}</p>}
    </div>
  );
}
