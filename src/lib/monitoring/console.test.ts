import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { maskConsole, maskConsoleArgs, writeMaskedLine } from "./console";
import { scrub } from "./mask";

describe("scrub", () => {
  it("masks an e-mail cut short by V8's truncation", () => {
    expect(scrub(`Unexpected token 'a', "anna.k@exa"... is not valid JSON`)).toBe(`Unexpected token 'a', "<email>"... is not valid JSON`);
    expect(scrub(`"anna.k@"`)).toBe(`"<email>"`);
    expect(scrub("anna.k@example.com")).toBe("<email>");
    // a scoped package or a bare @ is not an address
    expect(scrub("node_modules/@supabase/ssr and @ alone")).toBe("node_modules/@supabase/ssr and @ alone");
  });

  it("masks Ukrainian national numbers with spaces, dashes or brackets", () => {
    for (const phone of ["066 830 10 29", "(066) 830-10-29", "066-830-10-29", "(066)8301029", "0668301029"]) {
      expect(scrub(`call ${phone} now`), phone).not.toMatch(/\d{2}/);
    }
    // cut short by V8's truncation of a JSON error message
    expect(scrub(`Unexpected token '(', "(066) 830-"... is not valid JSON`)).toBe(`Unexpected token '(', "<phone>-"... is not valid JSON`);
    expect(scrub(`"066 830 1"`)).toBe(`"<phone>"`);
    expect(scrub("+38 066 830 10 29")).toBe("<phone>");
    expect(scrub("+380668301029")).toBe("<phone>");
    // dates, times, ports and stack positions stay readable
    expect(scrub("2026-10-16T05:21:43.567Z at file.js:15:70531 port 41311")).toBe("2026-10-16T05:21:43.567Z at file.js:15:70531 port 41311");
  });
});

describe("maskConsoleArgs", () => {
  it("masks strings and errors, keeping the type, the frames, the digest and the cause", () => {
    const cause = new Error("cause of anna@example.com");
    const error = Object.assign(new SyntaxError(`Unexpected token 'a', "anna.k@exa"... is not valid JSON`, { cause }), {
      digest: "3364946415",
    });
    const [prefix, masked, count] = maskConsoleArgs(["⨯ for +380668301029", error, 3]) as [string, SyntaxError & { digest: string; cause: Error }, number];

    expect(prefix).toBe("⨯ for <phone>");
    expect(count).toBe(3);
    expect(masked).toBeInstanceOf(SyntaxError);
    expect(masked).not.toBe(error);
    expect(masked.message).toBe(`Unexpected token 'a', "<email>"... is not valid JSON`);
    expect(masked.stack).toContain("console.test.ts");
    expect(masked.stack).not.toContain("anna.k@");
    expect(masked.digest).toBe("3364946415");
    expect(masked.cause.message).toBe("cause of <email>");
    // the original is untouched: whoever holds it (onRequestError, React) still has the real error
    expect(error.message).toContain("anna.k@exa");

    // Node prints the copy as an error, without the address
    const printed = inspect(masked);
    expect(printed).toMatch(/^SyntaxError: Unexpected token/);
    expect(printed).not.toMatch(/anna|example\.com/);
    expect(printed).toContain("digest: '3364946415'");
  });

  it("leaves other values alone", () => {
    const value = { email: "kept@example.com" };
    expect(maskConsoleArgs([value, 1, null, undefined])).toEqual([value, 1, null, undefined]);
  });
});

describe("maskConsole", () => {
  it("masks console.error and console.warn of the console it wraps, once", () => {
    const error = vi.fn();
    const warn = vi.fn();
    const target = { error, warn };
    maskConsole(target);
    maskConsole(target);
    target.error("Unhandled Rejection:", new Error("lost order of olena@example.com"));
    target.warn("phone (066) 830-10-29");

    expect(error).toHaveBeenCalledTimes(1);
    const [label, logged] = error.mock.calls[0] as [string, Error];
    expect(label).toBe("Unhandled Rejection:");
    expect(logged.message).toBe("lost order of <email>");
    expect(warn).toHaveBeenCalledWith("phone <phone>");
  });

  it("lets the structured event, masked already, past the wrapper with its ids", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    maskConsole(console);
    const id = "id 6b1e0c7a5f3d4e2b9a8c7d6e5f4a3b2c";
    console.error(id);
    writeMaskedLine(id);
    expect(spy.mock.calls).toEqual([["id <token>"], [id]]);
    spy.mockRestore();
  });
});
