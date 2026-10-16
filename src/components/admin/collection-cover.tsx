"use client";

import { ImageUpIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";
import type { CollectionActionResult, CoverUploadResult, FinishCoverResult } from "@/app/[locale]/admin/collections/actions";
import { Button } from "@/components/ui/button";

type CollectionCoverProps = {
  collectionId: string;
  cover: { url: string; width: number; height: number } | null;
  maxBytes: number;
  actions: {
    createCoverUpload: (input: { id: string }) => Promise<CoverUploadResult>;
    finishCoverUpload: (input: { id: string; uploadId: string }) => Promise<FinishCoverResult>;
    removeCover: (input: { id: string }) => Promise<CollectionActionResult>;
  };
};

const UPLOAD_FAILURES = ["tooLarge", "unsupportedType", "invalidImage"] as const;
const ERROR_KEYS = ["notAuthorized", "notFound", "tooManyRequests"] as const;

/**
 * The collection's cover photo (#67): the photo, a button that takes a new one from the phone's camera or files,
 * and one that removes it. The upload is the product photos' pipeline (#18): straight to the private staging bucket
 * through a signed URL, then checked and re-encoded without metadata on the server.
 */
export function CollectionCover({ collectionId, cover, maxBytes, actions }: CollectionCoverProps) {
  const t = useTranslations("admin.collections");
  const tImages = useTranslations("admin.images");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const maxMb = Math.round(maxBytes / 1024 / 1024);

  function errorOf(reason: string, fileName = ""): string {
    const failure = UPLOAD_FAILURES.find((key) => key === reason);
    if (failure) return tImages(`uploadErrors.${failure}`, { name: fileName, maxMb });
    const key = ERROR_KEYS.find((k) => k === reason) ?? "unexpectedError";
    return t(`errors.${key}`);
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > maxBytes) return setError(errorOf("tooLarge", file.name));
    startTransition(async () => {
      try {
        const created = await actions.createCoverUpload({ id: collectionId });
        if (!created.ok) return setError(errorOf(created.reason));
        const response = await fetch(created.signedUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || "application/octet-stream", "x-upsert": "false" },
        });
        if (!response.ok) return setError(errorOf(response.status === 413 ? "tooLarge" : "unexpectedError", file.name));
        const finished = await actions.finishCoverUpload({ id: collectionId, uploadId: created.uploadId });
        if (!finished.ok) return setError(errorOf(finished.reason, file.name));
        toast.success(t("cover.uploaded"));
      } catch {
        setError(errorOf("unexpectedError"));
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await actions.removeCover({ id: collectionId }).catch((): CollectionActionResult => ({ ok: false, reason: "unexpectedError" }));
      if (!result.ok) return setError(errorOf(result.reason));
      toast.success(t("cover.removed"));
    });
  }

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3" data-testid="collection-cover">
      <h2 id={`${id}-title`} className="font-sans text-lg font-semibold">
        {t("sections.cover")}
      </h2>
      <p id={`${id}-hint`} className="font-input text-xs text-foreground/70">
        {t("cover.hint", { maxMb })}
      </p>
      {cover ? (
        <span className="relative block aspect-[3/1] w-full max-w-xl overflow-hidden rounded bg-muted">
          <Image src={cover.url} alt="" fill sizes="(min-width: 64rem) 36rem, 100vw" quality={75} className="object-cover" />
        </span>
      ) : (
        <p className="text-sm">{t("cover.none")}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
          className="sr-only"
          aria-describedby={`${id}-hint`}
          data-testid="collection-cover-input"
        />
        <Button type="button" variant="outline" disabled={pending} aria-busy={pending || undefined} onClick={() => input.current?.click()} className="min-h-12">
          <ImageUpIcon aria-hidden />
          {pending ? t("cover.uploading") : t(cover ? "cover.replace" : "cover.upload")}
        </Button>
        {cover && (
          <Button type="button" variant="ghost" disabled={pending} onClick={remove} className="min-h-12">
            <Trash2Icon aria-hidden />
            {t("cover.remove")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="font-input text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
