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
// how many getUser() calls fail next as a network error does (AuthRetryableFetchError)
let failingGetUsers = 0;
vi.mock("@/lib/supabase/server", async () => {
  const { AuthRetryableFetchError } = await import("@supabase/supabase-js");
  return {
  createSessionClient: async () => ({
    auth: {
      getUser: async () => {
        if (failingGetUsers > 0) {
          failingGetUsers -= 1;
          return { data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) };
        }
        return authUser ? { data: { user: authUser }, error: null } : { data: { user: null }, error: { message: "no session" } };
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
    }),
  }),
  };
});

const { getAdmin, getCurrentUser, requireAdmin, requireUser, resolveUser, signInPath, SessionUnavailableError } = await import(
  "@/lib/auth/session"
);
const { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } = await import("@supabase/supabase-js");

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

describe("a network error is never an authorization decision (#106)", () => {
  type ServerSupabaseClient = Parameters<typeof resolveUser>[0];
  type Answer = { data: { user: { id: string; email: string } | null }; error: Error | null };
  type ProfileAnswer = { data: Profile; error: { message: string } | null };
  const signedIn: Answer = { data: { user: { id: "u1", email: "olena@example.test" } }, error: null };
  const fetchFailed = (): Answer => ({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
  const adminProfile: ProfileAnswer = { data: { name: "Olena", phone: null, role: "admin" }, error: null };

  /** A session client whose getUser() gives `answers` in turn, and whose profile read gives `profileAnswer`. */
  function client(answers: Answer[], profileAnswer = adminProfile) {
    const getUser = vi.fn(async () => {
      const next = answers.shift();
      if (!next) throw new Error("getUser called once too often");
      return next;
    });
    const mock = {
      auth: { getUser },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => profileAnswer }) }) }),
    };
    return { getUser, client: mock as unknown as ServerSupabaseClient };
  }

  beforeEach(() => {
    authUser = null;
    profile = null;
    failingGetUsers = 0;
  });

  it("asks Auth once more after a failed request and reads the user from the second answer", async () => {
    const { getUser, client: session } = client([fetchFailed(), signedIn]);
    await expect(resolveUser(session)).resolves.toMatchObject({ id: "u1", role: "admin" });
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("throws SessionUnavailableError, not signed out, when the second request fails too", async () => {
    const badGateway: Answer = { data: { user: null }, error: new AuthRetryableFetchError("Bad Gateway", 502) };
    const { getUser, client: session } = client([fetchFailed(), badGateway]);
    const error = await resolveUser(session).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SessionUnavailableError);
    expect((error as Error).cause).toBe(badGateway.error);
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("reads a missing or a rejected session as signed out at once, without a second request", async () => {
    for (const error of [new AuthSessionMissingError(), new AuthApiError("invalid JWT", 403, "bad_jwt")]) {
      const { getUser, client: session } = client([{ data: { user: null }, error }]);
      await expect(resolveUser(session)).resolves.toBeNull();
      expect(getUser).toHaveBeenCalledTimes(1);
    }
  });

  it("throws SessionUnavailableError when the profile cannot be read, instead of a customer without a role", async () => {
    const { client: session } = client([signedIn], { data: null, error: { message: "TypeError: fetch failed" } });
    await expect(resolveUser(session)).rejects.toBeInstanceOf(SessionUnavailableError);
  });

  it("passes the error on from every helper: no redirect to sign in, no not-found, no null", async () => {
    signIn("admin");
    failingGetUsers = 1;
    await expect(getAdmin()).resolves.toMatchObject({ role: "admin" });
    for (const call of [() => getCurrentUser(), () => getAdmin(), () => requireUser("uk"), () => requireAdmin("uk", "/uk/admin")]) {
      failingGetUsers = 2;
      await expect(call()).rejects.toBeInstanceOf(SessionUnavailableError);
    }
  });
});
