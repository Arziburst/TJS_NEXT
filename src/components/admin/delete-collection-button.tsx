"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { CollectionActionResult } from "@/app/[locale]/admin/collections/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { ADMIN_COLLECTIONS_HREF } from "./paths";

const ERROR_KEYS = ["notAuthorized", "notFound", "tooManyRequests"] as const;

/** Deletes the collection after a confirmation (its pieces stay in the shop), then goes back to the list. */
export function DeleteCollectionButton({
  collectionId,
  name,
  deleteCollection,
}: {
  collectionId: string;
  name: string;
  deleteCollection: (input: { id: string }) => Promise<CollectionActionResult>;
}) {
  const t = useTranslations("admin.collections");
  const tForm = useTranslations("admin.form");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteCollection({ id: collectionId }).catch((): CollectionActionResult => ({ ok: false, reason: "unexpectedError" }));
      if (!result.ok) {
        const reason = ERROR_KEYS.find((key) => key === result.reason) ?? "unexpectedError";
        toast.error(t(`errors.${reason}`));
        return;
      }
      setOpen(false);
      toast.success(t("delete.deleted"));
      router.replace(ADMIN_COLLECTIONS_HREF);
    });
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)} className="min-h-12 sm:justify-self-start">
        <Trash2Icon aria-hidden />
        {t("delete.button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete.title", { name })}</DialogTitle>
            <DialogDescription>{t("delete.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{tForm("cancel")}</DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
              {t("delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
