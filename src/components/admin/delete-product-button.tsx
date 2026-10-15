"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ProductActionResult } from "@/app/[locale]/admin/actions";
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
import { useRouter } from "@/i18n/navigation";
import { ADMIN_PRODUCTS_HREF } from "./paths";

type DeleteProductButtonProps = {
  productId: string;
  title: string;
  deleteProduct: (input: { id: string }) => Promise<ProductActionResult>;
};

/** Soft delete behind a confirmation dialog; back to the list afterwards. */
export function DeleteProductButton({ productId, title, deleteProduct }: DeleteProductButtonProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteProduct({ id: productId });
      if (!result.ok) {
        toast.error(t("product.deletionError"));
        return;
      }
      setOpen(false);
      toast.success(t("form.deleted", { title }));
      router.replace(ADMIN_PRODUCTS_HREF);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="destructive" className="justify-self-start" />}>
        <Trash2Icon aria-hidden />
        {t("form.delete")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("product.confirmDeletionTwice")}</DialogTitle>
          <DialogDescription>{t("form.deleteDescription", { title })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("form.cancel")}</DialogClose>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
            {t("form.deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
