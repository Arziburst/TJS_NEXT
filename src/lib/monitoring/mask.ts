// Server code (src/instrumentation.ts and src/lib/monitoring/); no "server-only": instrumentation is not built
// with the react-server condition.

/*
 * The masks every server log line goes through (#31): the structured error event of report.ts and, through
 * console.ts, whatever Next or a library prints with console.error / console.warn. Personal data and secrets
 * are replaced by a placeholder; the rest of the text (paths, stack frames, ids) stays readable.
 */

const MASKS: [RegExp, string][] = [
  // an e-mail address, also one cut short by V8's message truncation ("anna.k@exa", "anna.k@"): the local part
  // goes whenever an @ follows it
  [/[\w.+-]+@[\w-]*(\.[\w-]*)*/g, "<email>"],
  // JWTs and bearer tokens before the generic long tokens
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>"],
  [/\b(bearer|basic)\s+[\w.~+/=-]+/gi, "$1 <token>"],
  // an international number: +38 (066) 830 10 29, +380668301029
  [/\+\d[\d\s().-]{7,}\d/g, "<phone>"],
  // a Ukrainian national number with or without spaces, dashes or brackets: 066 830 10 29, (066) 830-10-29
  [/(?<![\w.])\(?0\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\w)/g, "<phone>"],
  [/\b\d{10,}\b/g, "<number>"],
  [/\b[A-Za-z0-9_-]{32,}\b/g, "<token>"],
];

/** The text with personal data and secrets masked. */
export function scrub(text: string): string {
  return MASKS.reduce((value, [pattern, mask]) => value.replace(pattern, mask), text);
}
