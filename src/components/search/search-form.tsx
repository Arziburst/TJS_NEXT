import { SearchIcon } from "lucide-react";
import type { Route } from "next";
import Form from "next/form";
import { useLocale, useTranslations } from "next-intl";
import type { FormEvent } from "react";
import { routes } from "@/config/routes";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { MAX_QUERY_LENGTH } from "@/lib/search/query";
import { cn } from "@/lib/utils";

type SearchFormProps = {
  /** The id of the input (each form on the page has its own). */
  id: string;
  defaultValue?: string;
  className?: string;
  /** The mobile menu closes itself on a search. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  autoFocus?: boolean;
};

/**
 * The site search box: a GET form to /<locale>/search?q=… (next/form: a client navigation with JavaScript,
 * a plain form submission without). The same in the header, the mobile menu and on the search page.
 */
export function SearchForm({ id, defaultValue, className, onSubmit, autoFocus }: SearchFormProps) {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;

  return (
    <Form
      action={getPathname({ href: routes.search.path, locale }) as Route}
      role="search"
      onSubmit={onSubmit}
      className={cn("flex h-11 items-stretch border-b-2 border-primary focus-within:border-accent", className)}
    >
      <label htmlFor={id} className="sr-only">
        {t("searchLabel")}
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={t("searchPlaceholder")}
        maxLength={MAX_QUERY_LENGTH}
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        className="w-full min-w-0 bg-transparent px-1 font-sans text-base outline-none placeholder:text-muted-foreground sb:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      <button
        type="submit"
        aria-label={t("search")}
        className="inline-flex w-11 shrink-0 items-center justify-center transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <SearchIcon aria-hidden className="size-5" />
      </button>
    </Form>
  );
}
