import { notFound, redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { keepFormOnThrow } from "@/components/admin/form-action";

vi.mock("server-only", () => ({}));

const { SessionUnavailableError } = await import("@/lib/auth/session");

type State = { status: "idle" } | { status: "error"; error?: "unexpectedError" } | { status: "saved"; id: string };
const idle: State = { status: "idle" };
const unexpected: State = { status: "error", error: "unexpectedError" };

describe("keepFormOnThrow (#112)", () => {
  it("returns the form's failed state when the action throws SessionUnavailableError", async () => {
    const action = keepFormOnThrow<State, FormData>(async () => {
      throw new SessionUnavailableError();
    }, unexpected);
    await expect(action(idle, new FormData())).resolves.toBe(unexpected);
  });

  it("returns the failed state for any other thrown error (a production server error, a dropped network)", async () => {
    const action = keepFormOnThrow<State, FormData>(async () => {
      throw Object.assign(new Error("An error occurred in the Server Components render."), { digest: "123" });
    }, unexpected);
    await expect(action(idle, new FormData())).resolves.toBe(unexpected);
  });

  it("passes the action's own state and arguments through", async () => {
    const saved: State = { status: "saved", id: "p1" };
    const inner = vi.fn<(previous: State, payload: FormData) => Promise<State>>(async () => saved);
    const form = new FormData();
    await expect(keepFormOnThrow(inner, unexpected)(idle, form)).resolves.toBe(saved);
    expect(inner).toHaveBeenCalledWith(idle, form);
  });

  it("lets Next's redirect and not-found signals through", async () => {
    const redirecting = keepFormOnThrow<State, FormData>(async () => redirect("/en/sign-in-and-up"), unexpected);
    await expect(redirecting(idle, new FormData())).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT/) });
    const missing = keepFormOnThrow<State, FormData>(async () => notFound(), unexpected);
    await expect(missing(idle, new FormData())).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) });
  });
});
