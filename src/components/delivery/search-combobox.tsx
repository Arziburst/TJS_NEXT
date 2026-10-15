"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useId, useState, type ReactNode } from "react";
import type { SearchResult } from "@/lib/delivery/nova-poshta/types";
import { cn } from "@/lib/utils";

// typing settles this long before a search is sent
export const SEARCH_DEBOUNCE_MS = 300;

type Results<T> = { key: string; result: SearchResult<T> };

type SearchComboboxProps<T> = {
  label: string;
  placeholder: string;
  // data-slot of the root, for styling hooks and tests
  slot: string;
  value: T | null;
  onValueChange: (value: T | null) => void;
  // a server action; called with the trimmed text once typing settles
  search: (query: string) => Promise<SearchResult<T>>;
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  renderItem?: (item: T) => ReactNode;
  // 0: the list is searched (with an empty text) as soon as it opens
  minLength: number;
  // a change (another city, another filter) starts the search over
  scope?: string;
  disabled?: boolean;
};

/*
 * An accessible async combobox (Base UI): the server searches, the list only shows what it answered. The
 * status line under the input (searching, type more, nothing found, unavailable) is announced to screen readers.
 */
export function SearchCombobox<T>({
  label,
  placeholder,
  slot,
  value,
  onValueChange,
  search,
  itemKey,
  itemLabel,
  renderItem,
  minLength,
  scope = "",
  disabled,
}: SearchComboboxProps<T>) {
  const t = useTranslations("checkout.delivery.search");
  // the shop's one "too many attempts" text (the auth limiter's)
  const errors = useTranslations("auth.errors");
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results<T> | null>(null);

  const trimmed = query.trim();
  const tooShort = trimmed.length < minLength;
  const requestKey = `${scope}\n${trimmed}`;
  const current = results?.key === requestKey ? results.result : null;
  const searching = open && !tooShort && !current;

  const runSearch = useEffectEvent(async (text: string, key: string, isCurrent: () => boolean) => {
    const result = await search(text).catch((): SearchResult<T> => ({ ok: false, reason: "unavailable" }));
    if (isCurrent()) setResults({ key, result });
  });

  useEffect(() => {
    if (!open || tooShort) return;
    let live = true;
    const timer = setTimeout(() => runSearch(trimmed, requestKey, () => live), SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, tooShort, trimmed, requestKey]);

  const found = current?.ok ? current.items : [];
  // the chosen item stays among the items, so its label shows while other results load
  const items = value && !found.some((item) => itemKey(item) === itemKey(value)) ? [...found, value] : found;

  let status: ReactNode = null;
  if (searching) {
    status = (
      <>
        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        {t("searching")}
      </>
    );
  } else if (open && tooShort && minLength > 0 && !value) {
    status = t("typeMore", { min: minLength });
  } else if (current && !current.ok) {
    if (current.reason === "invalidQuery") status = t("ukrainianOnly");
    else if (current.reason === "rateLimited") status = errors("rateLimited");
    else status = t("unavailable");
  } else if (current?.ok && current.items.length === 0) {
    status = t("empty");
  }

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(next) => onValueChange(next as T | null)}
      itemToStringLabel={(item: T) => itemLabel(item)}
      // the hidden form value is the Nova Poshta ref, not the whole object
      itemToStringValue={(item: T) => itemKey(item)}
      isItemEqualToValue={(item: T, selected: T) => itemKey(item) === itemKey(selected)}
      filter={null}
      open={open}
      onOpenChange={setOpen}
      onInputValueChange={(text, { reason }) => {
        // choosing an item writes its label into the input: that is not a new search
        if (reason !== "item-press") setQuery(text);
      }}
      disabled={disabled}
    >
      <div data-slot={slot} className="grid gap-2">
        <label htmlFor={inputId} className="font-sans text-sm font-semibold">
          {label}
        </label>
        <Combobox.InputGroup className="relative flex h-11 w-full items-center border-2 border-input bg-transparent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring data-disabled:opacity-50">
          <Combobox.Input
            id={inputId}
            placeholder={placeholder}
            className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-input text-base text-foreground outline-none placeholder:text-foreground/60 sm:text-sm"
          />
          {value ? (
            <Combobox.Clear aria-label={t("clear")} className="flex size-10 items-center justify-center hover:text-accent-text">
              <XIcon aria-hidden className="size-4" />
            </Combobox.Clear>
          ) : null}
          <Combobox.Trigger aria-label={t("open")} className="flex size-10 items-center justify-center hover:text-accent-text">
            <ChevronDownIcon aria-hidden className="size-4" />
          </Combobox.Trigger>
        </Combobox.InputGroup>
      </div>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup
            aria-busy={searching || undefined}
            className="w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) border-2 border-foreground bg-popover text-popover-foreground"
          >
            <div className="max-h-[min(var(--available-height),22rem)] overflow-y-auto overscroll-contain">
              <Combobox.Status className="empty:hidden flex items-center gap-2 px-3 py-2 font-input text-sm text-foreground/70">
                {status}
              </Combobox.Status>
              <Combobox.List>
                {(item: T) => (
                  <Combobox.Item
                    key={itemKey(item)}
                    value={item}
                    className="grid cursor-default grid-cols-[1rem_1fr] items-start gap-2 px-3 py-3 font-input text-sm outline-none select-none data-highlighted:bg-primary data-highlighted:text-primary-foreground"
                  >
                    <Combobox.ItemIndicator className="col-start-1 mt-0.5">
                      <CheckIcon aria-hidden className="size-4" />
                    </Combobox.ItemIndicator>
                    <span className={cn("col-start-2 grid gap-0.5")}>{renderItem ? renderItem(item) : itemLabel(item)}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
