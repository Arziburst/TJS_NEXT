import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("errors.notFound");
  return { title: t("title") };
}

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Link href="/" className="underline underline-offset-4">
        {t("home")}
      </Link>
    </main>
  );
}
