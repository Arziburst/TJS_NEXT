"use client";

import { Heading2Icon, Heading3Icon, Link2Icon, Link2OffIcon, ListIcon, ListOrderedIcon, PilcrowIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ClipboardEvent, type ComponentType, type SVGProps } from "react";
import { richTextClass } from "@/components/layout/rich-text-class";
import { cn } from "@/lib/utils";
import { controlClass } from "./styles";

type RichTextEditorProps = {
  id: string;
  // the form field the HTML is submitted in; the server keeps only the allowed format (src/lib/settings/rich-text.ts)
  name: string;
  initialHtml: string;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  lang?: string;
  // whether the editor holds any text now, saved or not (the locale's status in the form)
  onTextChange?: (hasText: boolean) => void;
};

type Command = {
  key: "heading" | "subheading" | "paragraph" | "bulletList" | "numberedList" | "link" | "unlink";
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const COMMANDS: readonly Command[] = [
  { key: "heading", icon: Heading2Icon },
  { key: "subheading", icon: Heading3Icon },
  { key: "paragraph", icon: PilcrowIcon },
  { key: "bulletList", icon: ListIcon },
  { key: "numberedList", icon: ListOrderedIcon },
  { key: "link", icon: Link2Icon },
  { key: "unlink", icon: Link2OffIcon },
];

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i;

/**
 * A small rich-text editor for the format the About page allows: headings, paragraphs, lists and links. The
 * browser's editing commands do the work (they run on every phone, with its own keyboard and selection
 * handles); a paste comes in as plain text, so no foreign formatting enters. What it submits is cleaned again
 * on the server.
 */
export function RichTextEditor({
  id,
  name,
  initialHtml,
  labelledBy,
  describedBy,
  invalid,
  lang,
  onTextChange,
}: RichTextEditorProps) {
  const t = useTranslations("admin.settings.about.toolbar");
  const editorRef = useRef<HTMLDivElement>(null);
  // the editor owns its DOM after the first render; React never rewrites it
  const [initial] = useState(initialHtml);
  const [html, setHtml] = useState(initialHtml);

  function sync() {
    setHtml(editorRef.current?.innerHTML ?? "");
    onTextChange?.((editorRef.current?.textContent ?? "").trim() !== "");
  }

  function run(command: Command["key"]) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("defaultParagraphSeparator", false, "p");
    switch (command) {
      case "heading":
        document.execCommand("formatBlock", false, "<h2>");
        break;
      case "subheading":
        document.execCommand("formatBlock", false, "<h3>");
        break;
      case "paragraph":
        document.execCommand("formatBlock", false, "<p>");
        break;
      case "bulletList":
        document.execCommand("insertUnorderedList");
        break;
      case "numberedList":
        document.execCommand("insertOrderedList");
        break;
      case "link": {
        const url = window.prompt(t("linkPrompt"), "https://")?.trim();
        if (url && SAFE_LINK.test(url)) document.execCommand("createLink", false, url);
        break;
      }
      case "unlink":
        document.execCommand("unlink");
        break;
    }
    sync();
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    sync();
  }

  return (
    <div className="grid gap-0">
      <div
        role="toolbar"
        aria-label={t("label")}
        aria-controls={id}
        className="flex flex-wrap gap-1 border-2 border-b-0 border-input p-1"
      >
        {COMMANDS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            title={t(key)}
            aria-label={t(key)}
            // keeps the selection in the editor while the button is pressed
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(key)}
            className="flex size-11 items-center justify-center outline-none hover:bg-hairline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sb:size-9"
          >
            <Icon aria-hidden className="size-5" />
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        id={id}
        role="textbox"
        aria-multiline
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        lang={lang}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        onPaste={onPaste}
        className={cn(controlClass, richTextClass, "min-h-48 py-3")}
        dangerouslySetInnerHTML={{ __html: initial }}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
