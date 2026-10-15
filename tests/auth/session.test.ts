import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

// redirect() and notFound() interrupt rendering by throwing; the mocks throw something recognizable.
class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
  notFound: () => {
    throw new NotFound("not found");
  },
}));

// The session client: who Auth says is signed in, and that user's profile row.
type Profile = { name: string | null; phone: string | null; role: "customer" | "admin" } | null;
let authUser: { id: string; email: string } | null = null;
let profile: Profile = null;
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: {
      getUser: async () =>
        authUser ? { data: { user: authUser }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
    }),
  }),
}));

const { getAdmin, requireAdmin, requireUser, signInPath } = await import("@/lib/auth/session");

function signIn(role: "customer" | "admin" | null) {
  authUser = { id: "u1", email: "olena@example.test" };
  profile = role ? { name: "Olena", phone: null, role } : null;
}

describe("requireAdmin", () => {
  beforeEach(() => {
    authUser = null;
    profile = null;
  });

  it("sends a guest to sign in, with the page to come back to", async () => {
    const error = await requireAdmin("uk", "/uk/orders").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Redirect);
    expect((error as Redirect).to).toBe("/uk/sign-in-and-up?next=%2Fuk%2Forders");
  });

  it("gives a signed-in customer the not-found page", async () => {
    signIn("customer");
    await expect(requireAdmin("en")).rejects.toBeInstanceOf(NotFound);
  });

  it("treats a user without a readable profile as a customer", async () => {
    signIn(null);
    await expect(requireAdmin("en")).rejects.toBeInstanceOf(NotFound);
  });

  it("lets an admin through and returns the user", async () => {
    signIn("admin");
    await expect(requireAdmin("en")).resolves.toMatchObject({ id: "u1", role: "admin", name: "Olena" });
  });
});

describe("getAdmin", () => {
  beforeEach(() => {
    authUser = null;
    profile = null;
  });

  it("is null for a guest and for a customer, the user for an admin; it never redirects", async () => {
    await expect(getAdmin()).resolves.toBeNull();
    signIn("customer");
    await expect(getAdmin()).resolves.toBeNull();
    signIn("admin");
    await expect(getAdmin()).resolves.toMatchObject({ id: "u1", role: "admin" });
  });
});

describe("requireUser", () => {
  beforeEach(() => {
    authUser = null;
    profile = null;
  });

  it("sends a guest to sign in and returns a signed-in user", async () => {
    await expect(requireUser("de")).rejects.toMatchObject({ to: "/de/sign-in-and-up" });
    signIn("customer");
    await expect(requireUser("de")).resolves.toMatchObject({ role: "customer" });
  });

  it("builds the sign-in path with an encoded return path", () => {
    expect(signInPath("en")).toBe("/en/sign-in-and-up");
    expect(signInPath("en", "/en/update-password")).toBe("/en/sign-in-and-up?next=%2Fen%2Fupdate-password");
  });
});
