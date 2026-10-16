// Server code (src/instrumentation.ts, Node.js runtime only); no "server-only": instrumentation is not built with
// the react-server condition.
import { scrub } from "./mask";

/*
 * Next prints every server error it captures itself ("⨯ SyntaxError: …" with the stack), and Node, Next or a
 * library may print an unhandled rejection or a warning the same way. The text of an error often carries what
 * the request sent (an e-mail, a phone), so console.error and console.warn mask their arguments with the masks of
 * the structured event (src/lib/monitoring/mask.ts) before anything reaches the host's logs (#31): strings, and
 * errors — as a masked copy that keeps the type, the stack frames, the digest and the cause.
 */

const MAX_DEPTH = 3;

function maskError(error: Error, depth: number): Error {
  // a native error (so Node prints it as one) with the original's prototype (so as the original's type)
  const copy = new Error() as Error & Record<string, unknown>;
  Object.setPrototypeOf(copy, Object.getPrototypeOf(error));
  for (const key of Object.getOwnPropertyNames(error)) {
    const value = (error as unknown as Record<string, unknown>)[key];
    // the digest is Next's hash of the error, the one id that finds it again: never personal, never masked
    copy[key] = key === "digest" ? value : maskValue(value, depth + 1);
  }
  // own properties of a few errors are getters on the prototype instead
  if (!Object.hasOwn(error, "message")) copy.message = scrub(error.message);
  if (!Object.hasOwn(error, "stack")) {
    // never the stack of the copy itself (this function)
    if (error.stack) copy.stack = scrub(error.stack);
    else delete copy.stack;
  }
  return copy;
}

function maskValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrub(value);
  if (depth >= MAX_DEPTH) return value;
  if (value instanceof Error) return maskError(value, depth);
  if (Array.isArray(value)) return value.map((item) => maskValue(item, depth + 1));
  return value;
}

/** The console arguments with personal data masked; anything else (numbers, plain objects) passes as it is. */
export function maskConsoleArgs(args: readonly unknown[]): unknown[] {
  return args.map((arg) => maskValue(arg, 0));
}

const MASKED = Symbol.for("tjs.console.masked");

type Logger = (...args: unknown[]) => void;
type MaskableConsole = { error: Logger; warn: Logger };

/** Makes console.error and console.warn mask their arguments. Once per console; later calls do nothing. */
export function maskConsole(target: MaskableConsole = console): void {
  const marked = target as MaskableConsole & { [MASKED]?: true };
  if (marked[MASKED]) return;
  marked[MASKED] = true;
  for (const level of ["error", "warn"] as const) {
    const original = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      let masked: unknown[];
      try {
        masked = maskConsoleArgs(args);
      } catch {
        // never lose a log line to the masking; the placeholder still says something was logged
        masked = ["[a log line could not be masked]"];
      }
      original(...masked);
    };
  }
}
