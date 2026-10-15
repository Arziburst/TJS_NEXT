import { sanitizeRichText } from "@/lib/settings/rich-text";
import { cn } from "@/lib/utils";
import { richTextClass } from "./rich-text-class";

type RichTextProps = { html: string; lang?: string; className?: string };

/** A stored rich text, cleaned again right before it is rendered (src/lib/settings/rich-text.ts). */
export function RichText({ html, lang, className }: RichTextProps) {
  return <div lang={lang} className={cn(richTextClass, className)} dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }} />;
}
