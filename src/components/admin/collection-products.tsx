"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { CollectionActionResult } from "@/app/[locale]/admin/collections/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AdminCollectionProduct } from "@/lib/admin/collections";
import { inputClass } from "./styles";

type CollectionProductsProps = {
  collectionId: string;
  products: AdminCollectionProduct[];
  /** Every product that is not deleted: the ones the admin can add. */
  pickable: AdminCollectionProduct[];
  setCollectionProducts: (input: { id: string; productIds: string[] }) => Promise<CollectionActionResult>;
};

type MoveControl = "earlier" | "later";

const ERROR_KEYS = ["notAuthorized", "notFound", "invalid", "tooManyRequests"] as const;

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * The collection's pieces in the owner's order (#67), mobile first: one row per piece with its photo, name and price,
 * arrow buttons to move it (every screen, keyboard included) and a button to take it out; a dialog with a search adds
 * pieces (each tap one, to the end). Every change sends the whole list to an admin Server Action, which refreshes the
 * page with the stored list.
 */
export function CollectionProducts({ collectionId, products, pickable, setCollectionProducts }: CollectionProductsProps) {
  const t = useTranslations("admin.collections");
  const tStatus = useTranslations("admin.status");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [listed, setListed] = useOptimistic(products);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const focusTarget = useRef<{ id: string; control: MoveControl; index: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // React moves the row in the DOM, which drops the focus: put it back on the moved piece's control
  useEffect(() => {
    const target = focusTarget.current;
    if (!target || listed[target.index]?.id !== target.id) return;
    focusTarget.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-product-id="${target.id}"] [data-control="${target.control}"]`)?.focus();
  }, [listed]);

  const usd = (minor: number | null) => (minor === null ? "—" : format.number(minor / 100, { style: "currency", currency: "USD" }));

  function store(next: AdminCollectionProduct[], done: () => void) {
    startTransition(async () => {
      setListed(next);
      const result = await setCollectionProducts({ id: collectionId, productIds: next.map((p) => p.id) }).catch(
        (): CollectionActionResult => ({ ok: false, reason: "unexpectedError" }),
      );
      if (!result.ok) {
        const reason = ERROR_KEYS.find((key) => key === result.reason) ?? "unexpectedError";
        toast.error(t(`errors.${reason}`));
        return;
      }
      done();
    });
  }

  function reorder(index: number, to: number, control: MoveControl) {
    const product = listed[index]!;
    const next = move(listed, index, to);
    focusTarget.current = { id: product.id, control, index: to };
    store(next, () => setAnnouncement(t("products.moved", { position: to + 1, count: next.length })));
  }

  function add(product: AdminCollectionProduct) {
    if (listed.some((p) => p.id === product.id)) return;
    store([...listed, product], () => toast.success(t("products.added", { title: product.title })));
  }

  function remove(product: AdminCollectionProduct) {
    store(
      listed.filter((p) => p.id !== product.id),
      () => toast.success(t("products.removed", { title: product.title })),
    );
  }

  const needle = query.trim().toLocaleLowerCase();
  const found = needle
    ? pickable.filter((p) => p.title.toLocaleLowerCase().includes(needle) || (p.sku?.toLocaleLowerCase().includes(needle) ?? false))
    : pickable;

  return (
    <section aria-labelledby="collection-products-title" className="grid gap-4" data-testid="collection-products">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="collection-products-title" className="font-sans text-lg font-semibold">
          {t("sections.products")}{" "}
          <span className="font-normal">{t("productCount", { count: listed.length })}</span>
        </h2>
        <Button type="button" variant="outline" onClick={() => setPicking(true)} className="min-h-12">
          <PlusIcon aria-hidden />
          {t("products.add")}
        </Button>
      </div>

      {listed.length === 0 ? (
        <p className="text-sm">{t("products.empty")}</p>
      ) : (
        <ol ref={listRef} className="grid gap-2">
          {listed.map((product, index) => (
            <li
              key={product.id}
              data-product-id={product.id}
              className="flex items-center gap-3 border-2 border-hairline p-2"
              data-testid="collection-product"
            >
              <span className="relative size-14 shrink-0 overflow-hidden rounded bg-muted">
                {product.image && <Image src={product.image.url} alt="" fill sizes="56px" quality={75} className="object-cover" />}
              </span>
              <span className="grid min-w-0 grow gap-0.5">
                <span className="font-sans text-sm font-semibold break-words">{product.title}</span>
                <span className="font-input text-xs">
                  {usd(product.priceUsdMinor)}
                  {product.status !== "published" && ` · ${tStatus(product.status)} · ${t("products.notInShop")}`}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending || index === 0}
                  onClick={() => reorder(index, index - 1, "earlier")}
                  aria-label={t("products.moveUp", { title: product.title })}
                  data-control="earlier"
                  className="size-11"
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending || index === listed.length - 1}
                  onClick={() => reorder(index, index + 1, "later")}
                  aria-label={t("products.moveDown", { title: product.title })}
                  data-control="later"
                  className="size-11"
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => remove(product)}
                  aria-label={t("products.remove", { title: product.title })}
                  className="size-11"
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4">
          <DialogHeader>
            <DialogTitle>{t("products.pickerTitle")}</DialogTitle>
            <DialogDescription>{t("products.pickerDescription")}</DialogDescription>
          </DialogHeader>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("products.search")}
            placeholder={t("products.search")}
            className={inputClass}
          />
          <ul className="grid gap-1 overflow-y-auto" data-testid="collection-picker">
            {found.length === 0 && <li className="p-2 text-sm">{t("products.noResults")}</li>}
            {found.map((product) => {
              const inCollection = listed.some((p) => p.id === product.id);
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={inCollection || pending}
                    onClick={() => add(product)}
                    className="flex min-h-14 w-full items-center gap-3 p-2 text-left outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <span className="relative size-11 shrink-0 overflow-hidden rounded bg-muted">
                      {product.image && <Image src={product.image.url} alt="" fill sizes="44px" quality={75} className="object-cover" />}
                    </span>
                    <span className="grid min-w-0 grow">
                      <span className="font-sans text-sm font-semibold break-words">{product.title}</span>
                      <span className="font-input text-xs">
                        {[product.sku, usd(product.priceUsdMinor), product.status !== "published" ? tStatus(product.status) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {inCollection && (
                      <span className="flex shrink-0 items-center gap-1 font-input text-xs">
                        <CheckIcon aria-hidden className="size-4" />
                        {t("products.inCollection")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <DialogClose render={<Button type="button" className="min-h-12" />}>{t("products.done")}</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
