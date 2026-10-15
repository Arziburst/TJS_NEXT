"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

// "Go back" of the legacy product page: one step back in the visitor's history.
export function GoBackButton({ className }: { className?: string }) {
  const t = useTranslations("common.actions");
  const router = useRouter();

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => router.back()} className={className}>
      <ArrowLeft aria-hidden data-icon="inline-start" />
      {t("goBack")}
    </Button>
  );
}
