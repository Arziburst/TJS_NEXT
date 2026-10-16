// Server code (src/instrumentation.ts and src/lib/monitoring/); no "server-only": instrumentation is not built
// with the react-server condition.

/*
 * The masks every server log line goes through (#31): the structured error event of report.ts and, through
 * console.ts, whatever Next or a library prints with console.error / console.warn. Personal data and secrets
 * are replaced by a placeholder; the rest of the text (paths, stack frames, ids) stays readable.
 */

// a fragment of a phone left at a boundary of V8's message truncation (..."+3806683, 0-10-29"...): an
// international prefix, or digit groups of one to three split by a space, a dash or brackets — never a date
// (a group of four), a time, a version or a stack position (no colons, no dots)
const TRUNCATION = String.raw`(?:\.\.\.|…)`;
const FRAGMENT = String.raw`(?:\+\d(?:[\d\s().-]*\d)?|\(?\d{1,3}\)?(?:[\s-]\(?\d{1,3}\)?)+)`;
const PHONE_FRAGMENT = new RegExp(
  String.raw`(?<=${TRUNCATION}"?)${FRAGMENT}(?!\d)|(?<![\w.:]|\d-)${FRAGMENT}(?="?${TRUNCATION})`,
  "g",
);

function maskPhoneFragment(fragment: string): string {
  // fewer than four digits ("+38", "1-2") say nothing about a customer
  return fragment.replace(/\D/g, "").length >= 4 ? "<phone>" : fragment;
}

const MASKS: [RegExp, string | ((match: string) => string)][] = [
  // an e-mail address, also one cut short by V8's message truncation ("anna.k@exa", "anna.k@"): the local part
  // goes whenever an @ follows it — unless a version does (pkg@1.2.3, @scope/pkg@2.0.0-beta.1, a .pnpm folder
  // next@16.0.1_react@19.0.0): no address ends in a numeric label; four numbers (1.2.3.4) stay an address
  [/[\w.+-]+@(?!\d+\.\d+\.\d+(?!\.\d))[\w-]*(\.[\w-]*)*/g, "<email>"],
  // JWTs and bearer tokens before the generic long tokens
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>"],
  [/\b(bearer|basic)\s+[\w.~+/=-]+/gi, "$1 <token>"],
  // an international number: +38 (066) 830 10 29, +380668301029
  [/\+\d[\d\s().-]{7,}\d/g, "<phone>"],
  // a Ukrainian national number with or without spaces, dashes or brackets — 066 830 10 29, (066) 830-10-29 —
  // also one cut short by V8's message truncation after its first six digits ("(066) 830-")
  [/(?<![\w.:])\(?0\d{2}\)?[\s-]?\d{3}(?:[\s-]?\d{1,2}){0,2}(?!\w)/g, "<phone>"],
  // what the two masks above leave of a number cut by V8's truncation
  [PHONE_FRAGMENT, maskPhoneFragment],
  [/\b\d{10,}\b/g, "<number>"],
  [/\b[A-Za-z0-9_-]{32,}\b/g, "<token>"],
];

/** The text with personal data and secrets masked. */
export function scrub(text: string): string {
  return MASKS.reduce(
    (value, [pattern, mask]) =>
      typeof mask === "string" ? value.replace(pattern, mask) : value.replace(pattern, mask),
    text,
  );
}
