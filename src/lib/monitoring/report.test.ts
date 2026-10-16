import { afterEach, describe, expect, it, vi } from "vitest";
import { errorEvent, parseDsn, reportServerError, scrub, sentryEnvelope } from "./report";
import { requestIdOf } from "./request-id";

const context = { requestId: "req-1", method: "POST", path: "/uk/checkout?email=a@b.c", routeType: "action", routePath: "/[locale]/checkout" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("scrub", () => {
  it("masks e-mails, phones, tokens and long numbers", () => {
    expect(scrub("user olena.k+1@example.com failed")).toBe("user <email> failed");
    expect(scrub("call +38 (066) 830 10 29 now")).toBe("call <phone> now");
    expect(scrub("np 0668301029")).toBe("np <phone>");
    expect(scrub("ttn 20450123456789")).toBe("ttn <number>");
    expect(scrub("auth Bearer abc.def-ghi")).toBe("auth Bearer <token>");
    expect(scrub("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl x")).toBe("jwt <jwt> x");
    expect(scrub("key tjs_test_0123456789abcdefghijklmnopqrstuv")).toBe("key <token>");
    expect(scrub("order TJS-2026-0042 not found")).toBe("order TJS-2026-0042 not found");
  });
});

describe("errorEvent", () => {
  it("keeps the path without its query, the type, a scrubbed message and the digest", () => {
    const error = Object.assign(new TypeError("no row for anna@example.com"), { digest: "12345" });
    const event = errorEvent(error, context);
    expect(event).toMatchObject({
      requestId: "req-1",
      method: "POST",
      path: "/uk/checkout",
      routeType: "action",
      errorType: "TypeError",
      message: "no row for <email>",
      digest: "12345",
    });
    expect(event.eventId).toMatch(/^[0-9a-f]{32}$/);
    expect(errorEvent("plain", context)).toMatchObject({ errorType: "string", message: "plain" });
  });
});

describe("reportServerError", () => {
  it("logs one JSON line once per error and sends nothing without a DSN", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const error = new Error("boom");
    await reportServerError(error, context);
    await reportServerError(error, context);
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line).toMatchObject({ level: "error", event: "server_error", requestId: "req-1", message: "boom" });
    expect(JSON.stringify(line)).not.toContain("a@b.c");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the same digest once", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await reportServerError(Object.assign(new Error("a"), { digest: "d-1" }), context);
    await reportServerError(Object.assign(new Error("a"), { digest: "d-1" }), context);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("sends an envelope to the DSN's endpoint and survives its failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("SENTRY_DSN", "https://publickey@o1.ingest.example.io/42");
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await reportServerError(new Error("sent"), context);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.example.io/api/42/envelope/");
    expect((init.headers as Record<string, string>)["x-sentry-auth"]).toContain("sentry_key=publickey");
    const [, item, payload] = String(init.body).split("\n").map((part) => JSON.parse(part));
    expect(item).toEqual({ type: "event" });
    expect(payload.exception.values[0]).toEqual({ type: "Error", value: "sent" });
    expect(payload.tags.request_id).toBe("req-1");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(reportServerError(new Error("still fine"), context)).resolves.toBeUndefined();
  });
});

describe("DSN and ids", () => {
  it("parses a DSN, with a path prefix, and refuses junk", () => {
    expect(parseDsn("https://k@sentry.example.com/7")?.endpoint).toBe("https://sentry.example.com/api/7/envelope/");
    expect(parseDsn("https://k@host.example/prefix/7")?.endpoint).toBe("https://host.example/prefix/api/7/envelope/");
    expect(parseDsn("https://host.example/7")).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
  });

  it("builds an envelope of three lines", () => {
    const envelope = sentryEnvelope(errorEvent(new Error("x"), context), "https://k@h/1");
    expect(envelope.split("\n")).toHaveLength(3);
  });

  it("takes the proxy's id, else the host's, else a new one; never a forged line", () => {
    expect(requestIdOf({ "x-request-id": "abc", "x-vercel-id": "fra1::x" })).toBe("abc");
    expect(requestIdOf({ "x-vercel-id": "fra1::iad1::abc-123" })).toBe("fra1::iad1::abc-123");
    expect(requestIdOf({ "x-request-id": 'x"\n{"level":"info"}' })).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdOf({})).toMatch(/^[0-9a-f-]{36}$/);
  });
});
