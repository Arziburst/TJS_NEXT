/*
 * The site search's query builder: the text of the search box becomes a list of plain words, the only thing
 * the database receives (`p_terms` of public.shop_search, a parameter, never SQL or tsquery text). The
 * database turns every word into a prefix match of its own (private.prefix_tsquery). Pure: used on the
 * server (the search page) and for the highlighting of the found titles.
 */

/** The longest query kept in the URL and searched; longer input is cut. */
export const MAX_QUERY_LENGTH = 100;
/** At most this many words are searched (the database refuses more). */
export const MAX_TERMS = 8;
/** The longest word searched (the database refuses longer ones). */
export const MAX_TERM_LENGTH = 64;

// letters (any script) and digits; everything else separates words: quotes, operators, punctuation
const WORD = /[\p{L}\p{N}]+/gu;

/** The query as the URL keeps it: NFKC, whitespace collapsed, trimmed, at most MAX_QUERY_LENGTH characters. */
export function normalizeQuery(raw: string | undefined | null): string {
  if (typeof raw !== "string") return "";
  const text = raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return [...text].slice(0, MAX_QUERY_LENGTH).join("").trim();
}

/**
 * The words of a query, lowercased: letters and digits only, each word once, in order, at most MAX_TERMS
 * words of at most MAX_TERM_LENGTH characters. Empty when nothing searchable is left.
 */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  for (const [word] of normalizeQuery(query).toLowerCase().matchAll(WORD)) {
    const term = [...word].slice(0, MAX_TERM_LENGTH).join("");
    if (!terms.includes(term)) terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

export type HighlightSegment = { text: string; match: boolean };

// one character, compared without case and diacritics ("É" -> "e"); may be longer than one character ("ß" stays)
function fold(char: string): string {
  return char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** How many characters of `chars` from `start` spell `term` (folded), or 0. */
function prefixLength(chars: readonly string[], start: number, term: string): number {
  let folded = "";
  for (let i = start; i < chars.length; i++) {
    if (!/[\p{L}\p{N}]/u.test(chars[i])) return 0;
    folded += fold(chars[i]);
    if (folded.length >= term.length) return folded.startsWith(term) ? i - start + 1 : 0;
    if (!term.startsWith(folded)) return 0;
  }
  return 0;
}

/**
 * A title split for highlighting: the start of every word that begins with a search term is a match, as the
 * search matches word prefixes ("корал" marks "Корал" in "Коралом"). Case and diacritics are ignored. The
 * segments join back to the title exactly; rendered as text, never as HTML.
 */
export function highlightSegments(title: string, terms: readonly string[]): HighlightSegment[] {
  const folded = [...new Set(terms.map((term) => [...term].map(fold).join("")).filter((term) => term !== ""))];
  const chars = [...title];
  const segments: HighlightSegment[] = [];
  const push = (text: string, match: boolean) => {
    const last = segments.at(-1);
    if (last && last.match === match) last.text += text;
    else segments.push({ text, match });
  };

  for (let i = 0; i < chars.length; ) {
    const wordStart = /[\p{L}\p{N}]/u.test(chars[i]) && (i === 0 || !/[\p{L}\p{N}]/u.test(chars[i - 1]));
    const length = wordStart ? Math.max(0, ...folded.map((term) => prefixLength(chars, i, term))) : 0;
    if (length > 0) {
      push(chars.slice(i, i + length).join(""), true);
      i += length;
    } else {
      push(chars[i], false);
      i += 1;
    }
  }
  return segments;
}
