import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  PASSWORD_MIN_LENGTH,
  safeNextPath,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/auth/schemas";

const validSignUp = {
  locale: "uk",
  name: "Olena Koval",
  email: "  Olena@Example.TEST ",
  phone: "+380 (94) 682-62-42",
  password: "secret-1",
  passwordAgain: "secret-1",
};

describe("auth schemas", () => {
  it("keeps the password minimum equal to Supabase Auth's (supabase/config.toml)", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config).toMatch(new RegExp(`^minimum_password_length = ${PASSWORD_MIN_LENGTH}\\s*$`, "m"));
  });

  it("normalizes a valid sign-up: email lower-cased and trimmed, phone without spaces or punctuation", () => {
    const result = signUpSchema.safeParse(validSignUp);
    expect(result.success && result.data).toMatchObject({
      email: "olena@example.test",
      phone: "+380946826242",
      name: "Olena Koval",
    });
  });

  it("reports one error code per field", () => {
    const result = signUpSchema.safeParse({
      locale: "uk",
      name: "Ann",
      email: "nope",
      phone: "0946826242",
      password: "12345",
      passwordAgain: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({
      name: "nameMinLength",
      email: "invalidEmail",
      phone: "invalidPhone",
      password: "passwordMinLength",
      passwordAgain: "required",
    });
  });

  it("refuses passwords that do not match", () => {
    const result = updatePasswordSchema.safeParse({ locale: "en", password: "secret-1", passwordAgain: "secret-2" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({ passwordAgain: "passwordsDontMatch" });
  });

  it("refuses a locale outside D3 and a missing email", () => {
    const result = signInSchema.safeParse({ locale: "ru", email: "", password: "x" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toMatchObject({ locale: "required", email: "required" });
  });

  it("never lets a role or other extra field through", () => {
    const result = signUpSchema.safeParse({ ...validSignUp, role: "admin" });
    expect(result.success && "role" in result.data).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each(["/en", "/uk/shop?sort=price_asc", "/de/update-password"])("keeps a same-site path: %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "en/shop", "/a b", "", null, undefined])(
    "drops anything else: %s",
    (value) => {
      expect(safeNextPath(value)).toBeUndefined();
    },
  );
});
