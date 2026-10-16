"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "@/components/layout/toast";
import type { ProductActionResult } from "@/app/[locale]/admin/actions";
import { Button } from "@/components/ui/button";
import type { ProductStatus } from "@/lib/admin/product-form";
import { cn } from "@/lib/utils";

type StatusToggleProps = {
  productId: string;
  status: ProductStatus;
  /** Without its uk translation a product cannot be published (the button says why instead). */
  canPublish: boolean;
  title: string;
  setProductStatus: (input: { id: string; status: ProductStatus }) => Promise<ProductActionResult>;
  className?: string;
};

/** One tap: publish a draft or archived product, unpublish (back to draft) a published one. */
export function StatusToggle({ productId, status, canPublish, title, setProductStatus, className }: StatusToggleProps) {
  const t = useTranslations("admin.list");
  const tErrors = useTranslations("admin.actionErrors");
  const [pending, startTransition] = useTransition();
  const published = status === "published";
  const next: ProductStatus = published ? "draft" : "published";

  function toggle() {
    startTransition(async () => {
      const result = await setProductStatus({ id: productId, status: next });
      if (result.ok) toast.success(t(published ? "unpublishedToast" : "publishedToast", { title }));
      else toast.error(tErrors(result.reason));
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={published ? "outline" : "default"}
      disabled={pending || (!published && !canPublish)}
      aria-label={t(published ? "unpublishLabel" : "publishLabel", { title })}
      onClick={toggle}
      className={cn("min-h-11 min-w-32", className)}
    >
      {t(published ? "unpublish" : "publish")}
    </Button>
  );
}
