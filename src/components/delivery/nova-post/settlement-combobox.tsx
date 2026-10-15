"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { searchNovaPostSettlements } from "@/lib/delivery/nova-post/actions";
import type { DeliveryCountry } from "@/lib/delivery/nova-post/countries";
import type { Settlement } from "@/lib/delivery/nova-post/types";
import { cn } from "@/lib/utils";

// The API searches from this many letters on (the Server Action refuses shorter text)
const MIN_SEARCH_LENGTH = 2;
// Typing pauses this long before a search is sent
const SEARCH_DELAY_MS = 300;

type SettlementComboboxProps = {
  country: DeliveryCountry;
  value: Settlement | null;
  onChange: (settlement: Settlement | null) => void;
  className?: string;
};

// The town of a Nova Post network country, searched by name on the server as the customer types
export function SettlementCombobox({ country, value, onChange, className }: SettlementComboboxProps) {
  const t = useTranslations("checkout.internationalDelivery");
  const locale = useLocale();
  const id = useId();
  const [results, setResults] = useState<Settlement[]>([]);
  const [searchText, setSearchText] = useState("");
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = searchText.trim();
  // the chosen town stays an item while other results come and go, so its label never disappears
  const items = useMemo(
    () => (!value || results.some((item) => item.id === value.id) ? results : [...results, value]),
    [results, value],
  );

  function search(text: string) {
    const request = ++latest.current;
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setFailed(false);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const result = await searchNovaPostSettlements({ country, text, locale });
        if (request !== latest.current) return;
        setFailed(!result.ok);
        setResults(result.ok ? result.settlements : []);
      });
    }, SEARCH_DELAY_MS);
  }

  function status(): string | null {
    if (isPending) return t("searching");
    if (failed) return t("loadError");
    if (trimmed.length < MIN_SEARCH_LENGTH) return value ? null : t("settlementHint");
    if (results.length === 0) return t("nothingFound");
    return null;
  }
  const statusText = status();

  return (
    <Combobox.Root
      items={items}
      value={value}
      itemToStringLabel={(item: Settlement) => item.name}
      isItemEqualToValue={(item: Settlement, selected: Settlement) => item.id === selected.id}
      filter={null}
      onValueChange={(next: Settlement | null) => {
        onChange(next);
        setSearchText("");
        setFailed(false);
      }}
      onInputValueChange={(next, { reason }) => {
        setSearchText(next);
        if (reason === "item-press") return;
        search(next);
      }}
    >
      <div className={cn("grid gap-2", className)}>
        <label htmlFor={id} className="font-sans text-sm font-semibold">
          {t("settlement")}
        </label>
        <Combobox.InputGroup className="relative h-11 w-full border-2 border-input focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <Combobox.Input
            id={id}
            name="settlement"
            placeholder={t("settlementPlaceholder")}
            autoComplete="off"
            className="h-full w-full bg-transparent pr-20 pl-2.5 font-input text-sm text-foreground outline-none placeholder:text-foreground/60"
          />
          <div className="absolute inset-y-0 right-0 flex items-center">
            <Combobox.Clear aria-label={t("clear")} className="flex size-10 items-center justify-center hover:opacity-70">
              <XIcon aria-hidden className="size-4" />
            </Combobox.Clear>
            <Combobox.Trigger aria-label={t("showList")} className="flex size-10 items-center justify-center hover:opacity-70">
              <ChevronDownIcon aria-hidden className="size-4" />
            </Combobox.Trigger>
          </div>
        </Combobox.InputGroup>
      </div>

      <Combobox.Portal>
        <Combobox.Positioner className="isolate z-50" sideOffset={4}>
          <Combobox.Popup
            aria-busy={isPending || undefined}
            className="w-(--anchor-width) max-w-(--available-width) border-2 border-foreground bg-popover text-popover-foreground"
          >
            <div className="max-h-[min(var(--available-height),20rem)] overflow-y-auto overscroll-contain">
              <Combobox.Status>
                {statusText ? <div className="px-3 py-3 font-input text-sm text-foreground/70">{statusText}</div> : null}
              </Combobox.Status>
              <Combobox.List>
                {(item: Settlement) => (
                  <Combobox.Item
                    key={item.id}
                    value={item}
                    className="grid cursor-default grid-cols-[1rem_1fr] items-start gap-2 px-3 py-2.5 font-input text-sm outline-none select-none data-highlighted:bg-primary data-highlighted:text-primary-foreground"
                  >
                    <Combobox.ItemIndicator className="col-start-1 mt-0.5">
                      <CheckIcon aria-hidden className="size-4" />
                    </Combobox.ItemIndicator>
                    <span className="col-start-2 grid gap-0.5">
                      <span className="font-semibold">{item.name}</span>
                      {item.region ? <span className="text-xs opacity-80">{item.region}</span> : null}
                    </span>
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
