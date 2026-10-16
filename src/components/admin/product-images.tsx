"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  CheckIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  StarIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useOptimistic, useRef, useState, useTransition, type DragEvent, type FormEvent } from "react";
import { toast } from "sonner";
import type {
  CreateUploadResult,
  FinishUploadResult,
  ImageActionError,
  ImageActionResult,
} from "@/app/[locale]/admin/image-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fallbackLocale } from "@/lib/catalog/mappers";
import type { Locale } from "@/i18n/routing";
import { EDITOR_LOCALES, IMAGE_ALT_MAX_LENGTH } from "@/lib/admin/product-form";
import type { AdminProductImage } from "@/lib/admin/products";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "./styles";

export type ProductImageActions = {
  createImageUpload: (input: { productId: string }) => Promise<CreateUploadResult>;
  finishImageUpload: (input: { productId: string; uploadId: string }) => Promise<FinishUploadResult>;
  deleteProductImage: (input: { productId: string; imageId: string }) => Promise<ImageActionResult>;
  reorderProductImages: (input: { productId: string; imageIds: string[] }) => Promise<ImageActionResult>;
  saveProductImageAlts: (input: {
    productId: string;
    imageId: string;
    alts: Partial<Record<Locale, string>>;
  }) => Promise<ImageActionResult>;
};

type ProductImagesProps = {
  productId: string;
  images: AdminProductImage[];
  /** Per locale, what the storefront shows for a photo without its own alt text. */
  altDefaults: Partial<Record<Locale, string>>;
  /** The largest file the server accepts (MAX_IMAGE_BYTES), to refuse a larger one before uploading it. */
  maxBytes: number;
  actions: ProductImageActions;
};

type MoveControl = "earlier" | "later";
type UploadStatus ={ key: string; name: string; state: "uploading" | "done" | "error"; message?: string };
type UploadFailure = "tooLarge" | "unsupportedType" | "invalidImage" | "failed";

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** The answer of the Storage upload: a refused type or size gets its own message. */
async function uploadFailure(response: Response): Promise<UploadFailure> {
  if (response.status === 413) return "tooLarge";
  const body = (await response.json().catch(() => null)) as { error?: string; statusCode?: string } | null;
  if (body?.statusCode === "413" || body?.error === "Payload too large") return "tooLarge";
  if (body?.statusCode === "415" || body?.error === "invalid_mime_type") return "unsupportedType";
  return "failed";
}

/**
 * The product's photos: upload several at once (the phone offers its camera), order them by dragging (desktop)
 * or with the arrow buttons (every screen, keyboard included), choose the main one (the first), delete one
 * after a confirmation, and edit its alt text per locale. Every change goes through an admin Server Action
 * that refreshes the page with the stored photos.
 */
export function ProductImages({ productId, images, altDefaults, maxBytes, actions }: ProductImagesProps) {
  const t = useTranslations("admin.images");
  const tForm = useTranslations("admin.form");
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [ordered, setOrdered] = useOptimistic(images);
  const [dragged, setDragged] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; index: number } | null>(null);
  const [editingAlts, setEditingAlts] = useState<{ image: AdminProductImage; index: number } | null>(null);
  const focusTarget = useRef<{ id: string; control: MoveControl; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const busy = pending || uploading;
  const maxMb = Math.floor(maxBytes / (1024 * 1024));

  // React moves the photo's card in the DOM, which drops the focus to the body: once the card is at its new
  // place, put the focus back on the moved photo's control (once: later renders of the same order move nothing),
  // unless the admin has gone on to another control meanwhile
  useEffect(() => {
    const target = focusTarget.current;
    if (!target || ordered[target.index]?.id !== target.id) return;
    focusTarget.current = null;
    const card = listRef.current?.querySelector<HTMLElement>(`[data-photo-id="${target.id}"]`);
    const active = document.activeElement;
    if (!card || (active && active !== document.body && !card.contains(active))) return;
    card.querySelector<HTMLElement>(`[data-control="${target.control}"]`)?.focus();
  }, [ordered]);

  function errorMessage(reason: ImageActionError): string {
    return t(`errors.${reason === "invalid" ? "unexpectedError" : reason}`);
  }

  function setStatus(key: string, status: Partial<UploadStatus>) {
    setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...status } : u)));
  }

  async function uploadOne(file: File, key: string): Promise<void> {
    const fail = (failure: UploadFailure) =>
      setStatus(key, { state: "error", message: t(`uploadErrors.${failure}`, { name: file.name, maxMb }) });
    if (file.size > maxBytes) return fail("tooLarge");
    try {
      const created = await actions.createImageUpload({ productId });
      if (!created.ok) return setStatus(key, { state: "error", message: errorMessage(created.reason) });
      // straight to Storage: a photo is larger than a Server Action request may be. An empty or unknown type
      // is fine: the staging bucket takes any, the server decides by the bytes
      const response = await fetch(created.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream", "x-upsert": "false" },
      });
      if (!response.ok) return fail(await uploadFailure(response));
      const finished = await actions.finishImageUpload({ productId, uploadId: created.uploadId });
      if (!finished.ok) {
        const { reason } = finished;
        if (reason === "tooLarge" || reason === "unsupportedType" || reason === "invalidImage") return fail(reason);
        if (reason === "uploadMissing") return fail("failed");
        return setStatus(key, { state: "error", message: errorMessage(reason) });
      }
      setStatus(key, { state: "done", message: t("uploaded", { name: file.name }) });
    } catch {
      // the connection dropped, or an action answered with a server error: this file failed, the batch goes on
      fail("failed");
    }
  }

  async function upload(files: File[]) {
    if (files.length === 0) return;
    const batch = files.map((file, i) => ({
      file,
      status: { key: `${Date.now()}-${i}`, name: file.name, state: "uploading" as const },
    }));
    setUploads(batch.map((b) => b.status));
    setUploading(true);
    try {
      // one after the other: a phone's upload bandwidth is the limit anyway, and the order is kept
      for (const { file, status } of batch) await uploadOne(file, status.key);
    } finally {
      setUploading(false);
    }
  }

  /** An action's answer, or the generic failure when the request itself failed (network, server error). */
  async function settle(call: () => Promise<ImageActionResult>): Promise<ImageActionResult> {
    try {
      return await call();
    } catch {
      return { ok: false, reason: "unexpectedError" };
    }
  }

  /** The new order; a move by button keeps the focus on the moved photo and announces its new position. */
  function reorder(next: AdminProductImage[], moved?: { id: string; control: MoveControl }) {
    if (moved) focusTarget.current = { ...moved, index: next.findIndex((image) => image.id === moved.id) };
    startTransition(async () => {
      setOrdered(next);
      const result = await settle(() =>
        actions.reorderProductImages({ productId, imageIds: next.map((image) => image.id) }),
      );
      if (!result.ok) {
        toast.error(errorMessage(result.reason));
        return;
      }
      if (moved) {
        const position = next.findIndex((image) => image.id === moved.id) + 1;
        setAnnouncement(t("moved", { position, count: next.length }));
      }
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const { id } = deleting;
    startTransition(async () => {
      const result = await settle(() => actions.deleteProductImage({ productId, imageId: id }));
      if (!result.ok) {
        toast.error(errorMessage(result.reason));
        return;
      }
      setDeleting(null);
      toast.success(t("deleted"));
    });
  }

  function saveAlts(event: FormEvent<HTMLFormElement>) {
    // the dialog is portalled out of the product form in the DOM, but React still bubbles its submit there
    event.preventDefault();
    event.stopPropagation();
    if (!editingAlts) return;
    const data = new FormData(event.currentTarget);
    const alts = Object.fromEntries(EDITOR_LOCALES.map((locale) => [locale, String(data.get(locale) ?? "")]));
    const imageId = editingAlts.image.id;
    startTransition(async () => {
      const result = await settle(() => actions.saveProductImageAlts({ productId, imageId, alts }));
      if (!result.ok) {
        toast.error(errorMessage(result.reason));
        return;
      }
      setEditingAlts(null);
      toast.success(t("altSaved"));
    });
  }

  function onDrop(event: DragEvent, to: number) {
    event.preventDefault();
    const from = dragged;
    setDragged(null);
    setDropTarget(null);
    if (from === null || from === to) return;
    reorder(move(ordered, from, to));
  }

  const done = uploads.filter((u) => u.state === "done").length;

  return (
    <section aria-labelledby="admin-photos" className="grid gap-3">
      <h2 id="admin-photos" className="font-sans text-lg font-semibold">
        {tForm("sections.photos")}
      </h2>
      <p className="font-input text-xs">{t("hint", { maxMb })}</p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          multiple
          // image/* lets a phone offer its camera next to the gallery; the server decides by the content
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = "";
            void upload(files);
          }}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
          {uploading ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <ImagePlusIcon aria-hidden />}
          {t("add")}
        </Button>
      </div>

      <div aria-live="polite" className="grid gap-1 font-input text-sm empty:hidden">
        {uploads.length > 0 && (
          <>
            <p className="font-semibold">{t("progress", { done, total: uploads.length })}</p>
            <ul className="grid gap-1">
              {uploads.map((u) => (
                <li key={u.key} className="flex items-start gap-2 break-all">
                  {u.state === "uploading" && <LoaderCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin" />}
                  {u.state === "done" && <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />}
                  {u.state === "error" && <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <span>{u.message ?? t("uploading", { name: u.name })}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="font-input text-sm">{tForm("noPhotos")}</p>
      ) : (
        <>
          {ordered.length > 1 && (
            <>
              <p className="font-input text-xs sb:hidden">{t("orderHintButtons")}</p>
              <p className="hidden font-input text-xs sb:block">{t("orderHint")}</p>
            </>
          )}
          <ol ref={listRef} className="grid gap-3 sb:grid-cols-4" aria-busy={pending}>
            {ordered.map((image, index) => {
              const number = index + 1;
              const first = index === 0;
              const last = index === ordered.length - 1;
              return (
                <li
                  key={image.id}
                  draggable={!busy}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    setDragged(index);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                    setDropTarget(null);
                  }}
                  onDragOver={(event) => {
                    if (dragged === null) return;
                    event.preventDefault();
                    setDropTarget(index);
                  }}
                  onDrop={(event) => onDrop(event, index)}
                  data-testid="admin-photo"
                  data-photo-id={image.id}
                  className={cn(
                    "flex gap-3 border-2 border-hairline p-2 sb:flex-col sb:cursor-grab",
                    dragged === index && "opacity-50",
                    dropTarget === index && dragged !== index && "border-primary",
                  )}
                >
                  <div className="relative size-24 shrink-0 overflow-hidden bg-muted sb:aspect-square sb:size-auto">
                    <Image
                      src={image.url}
                      alt={tForm("photoAlt", { index: number })}
                      fill
                      sizes="(min-width: 1024px) 256px, 96px"
                      quality={75}
                      placeholder={image.blurDataUrl ? (image.blurDataUrl as `data:image/${string}`) : "empty"}
                      draggable={false}
                      className="object-cover"
                    />
                  </div>
                  <div className="grid min-w-0 flex-1 content-start gap-2">
                    {first ? (
                      <p className="inline-flex min-h-9 items-center gap-1.5 font-sans text-sm font-semibold">
                        <StarIcon aria-hidden className="size-4 fill-current" />
                        {t("main")}
                      </p>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="justify-self-start"
                        disabled={busy}
                        focusableWhenDisabled
                        onClick={() => reorder(move(ordered, index, 0), { id: image.id, control: "later" })}
                      >
                        <StarIcon aria-hidden />
                        {t("makeMain")}
                      </Button>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        // stays focusable while disabled: a keyboard move must not drop the focus
                        disabled={busy || first}
                        focusableWhenDisabled
                        data-control="earlier"
                        aria-label={t("moveEarlier", { index: number })}
                        onClick={() => reorder(move(ordered, index, index - 1), { id: image.id, control: "earlier" })}
                      >
                        <ArrowUpIcon aria-hidden className="sb:hidden" />
                        <ArrowLeftIcon aria-hidden className="hidden sb:block" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={busy || last}
                        focusableWhenDisabled
                        data-control="later"
                        aria-label={t("moveLater", { index: number })}
                        onClick={() => reorder(move(ordered, index, index + 1), { id: image.id, control: "later" })}
                      >
                        <ArrowDownIcon aria-hidden className="sb:hidden" />
                        <ArrowRightIcon aria-hidden className="hidden sb:block" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={busy}
                        aria-label={t("altTextsOf", { index: number })}
                        onClick={() => setEditingAlts({ image, index })}
                      >
                        <TypeIcon aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        disabled={busy}
                        aria-label={t("deleteOf", { index: number })}
                        onClick={() => setDeleting({ id: image.id, index })}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </>
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription", { index: (deleting?.index ?? 0) + 1 })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{tForm("cancel")}</DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirmDelete}>
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editingAlts !== null} onOpenChange={(open) => !open && setEditingAlts(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {editingAlts && (
            <AltTextsForm
              key={editingAlts.image.id}
              image={editingAlts.image}
              index={editingAlts.index}
              altDefaults={altDefaults}
              pending={pending}
              onSubmit={saveAlts}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AltTextsForm({
  image,
  index,
  altDefaults,
  pending,
  onSubmit,
}: {
  image: AdminProductImage;
  index: number;
  altDefaults: Partial<Record<Locale, string>>;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("admin.images");
  const tForm = useTranslations("admin.form");
  const tLocales = useTranslations("nav.localeNames");
  // an empty locale shows the fallback alt (the storefront falls back to the en alt, then to the title)
  const [fallbackAlt, setFallbackAlt] = useState(image.alts[fallbackLocale] ?? "");

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("altTextsOf", { index: index + 1 })}</DialogTitle>
        <DialogDescription>{t("altHint")}</DialogDescription>
      </DialogHeader>
      <div className="relative mx-auto aspect-square w-32 overflow-hidden bg-muted">
        <Image src={image.url} alt="" fill sizes="128px" quality={75} className="object-cover" />
      </div>
      {EDITOR_LOCALES.map((locale) => {
        const id = `alt-${image.id}-${locale}`;
        const placeholder = (locale !== fallbackLocale && fallbackAlt.trim()) || altDefaults[locale] || "";
        return (
          <div key={locale} className="grid gap-1.5">
            <label htmlFor={id} className={labelClass} lang={locale}>
              {tLocales(locale)}
            </label>
            <input
              id={id}
              name={locale}
              lang={locale}
              defaultValue={image.alts[locale] ?? ""}
              placeholder={placeholder}
              maxLength={IMAGE_ALT_MAX_LENGTH}
              autoComplete="off"
              className={inputClass}
              onChange={locale === fallbackLocale ? (event) => setFallbackAlt(event.currentTarget.value) : undefined}
            />
          </div>
        );
      })}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{tForm("cancel")}</DialogClose>
        <Button type="submit" disabled={pending}>
          {t("altSave")}
        </Button>
      </DialogFooter>
    </form>
  );
}
