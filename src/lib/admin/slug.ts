/*
 * URL slugs from product titles, for every locale of D3: Ukrainian is transliterated by the national
 * standard (KMU 2010, the one the seed slugs follow), Latin scripts lose their diacritics. Pure: the product
 * form uses it in the browser while the title is typed, the server action when a slug is left empty.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 80;

// KMU 2010: є, ї, й, ю, я are written ye, yi, y, yu, ya at the start of a word and ie, i, i, iu, ia inside it
const UK_WORD_START: Record<string, string> = { є: "ye", ї: "yi", й: "y", ю: "yu", я: "ya" };
const UK: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
};
const APOSTROPHES = ["'", "’", "ʼ"];
const CYRILLIC = /\p{Script=Cyrillic}/u;
// letters that NFD does not split into a base letter and a combining mark
const LATIN: Record<string, string> = { ß: "ss", ł: "l", đ: "d", ø: "o", æ: "ae", œ: "oe", þ: "th", ð: "d" };

function transliterate(text: string): string {
  const chars = [...text];
  return chars
    .map((char, i) => {
      const previous = chars[i - 1] ?? "";
      if (!/[\p{L}'’ʼ]/u.test(previous) && char in UK_WORD_START) return UK_WORD_START[char];
      // "зг" is written "zgh", so it does not read as "ж"
      if (char === "г" && previous === "з") return "gh";
      // the Ukrainian apostrophe (об'єм) is dropped; in a Latin text (d'oreilles) it separates words
      if (APOSTROPHES.includes(char)) return CYRILLIC.test(previous) && CYRILLIC.test(chars[i + 1] ?? "") ? "" : "-";
      return UK[char] ?? LATIN[char] ?? char;
    })
    .join("");
}

/** "Сережки-краплі з коралом" -> "serezhky-krapli-z-koralom"; empty when nothing of the title is usable. */
export function slugify(title: string): string {
  const slug = transliterate(title.toLowerCase())
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  // cut at a word boundary when there is one
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  return cut.includes("-") ? cut.replace(/-[^-]*$/, "") : cut;
}
