import sanitizeHtml from "sanitize-html";

/*
 * The About page's rich text: headings, paragraphs, links and lists, nothing else. The admin's editor sends
 * HTML; the server keeps only these elements before it stores a text, and cleans a stored one again before it
 * renders it (a row written by a script never bypasses the allowlist). No attribute survives but a link's
 * href (web, mail, phone or a path of this site) and the rel/target the cleaner sets itself. Scripts, styles
 * and the like vanish with their content; any other element is unwrapped to its text.
 */

export const RICH_TEXT_MAX_LENGTH = 50_000;

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["h2", "h3", "p", "br", "ul", "ol", "li", "a"],
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["https", "http", "mailto", "tel"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "template", "iframe", "object", "svg", "math", "title"],
  transformTags: {
    // the page title is the h1: a pasted h1 becomes a section heading, deeper ones its subheadings
    h1: "h2",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    // editors write a paragraph as a div
    div: "p",
    a: (_tagName, attribs): sanitizeHtml.Tag => {
      const href = (attribs.href ?? "").trim();
      // a link without a usable href is only its text (a span is unwrapped)
      if (!SAFE_HREF.test(href)) return { tagName: "span", attribs: {} };
      if (!/^https?:/i.test(href)) return { tagName: "a", attribs: { href } };
      // an external link never hands this page to the site it opens
      return { tagName: "a", attribs: { href, rel: "noopener noreferrer", target: "_blank" } };
    },
  },
};

const EMPTY_BLOCK = /<(p|h2|h3|li)>(\s| |&nbsp;|<br \/>)*<\/\1>/g;
const EMPTY_LIST = /<(ul|ol)>\s*<\/\1>/g;

/** The allowed subset of `html`, without empty paragraphs, headings, items and lists, trimmed. */
export function sanitizeRichText(html: string): string {
  let result = sanitizeHtml(html, OPTIONS);
  let previous: string;
  do {
    previous = result;
    result = result.replace(EMPTY_BLOCK, "").replace(EMPTY_LIST, "");
  } while (result !== previous);
  return result.trim();
}

/** The plain text of a rich text (a meta description when none was written), whitespace collapsed. */
export function richTextToPlain(html: string): string {
  const text = sanitizeHtml(html.replace(/<\/(p|h2|h3|li)>|<br\s*\/?>/gi, " "), {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: OPTIONS.nonTextTags,
  });
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
