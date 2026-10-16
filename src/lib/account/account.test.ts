import { describe, expect, it } from "vitest";
import { displayName, profileNames } from "./names";
import { choiceFromOrder, parseStoredChoice, toChoiceInput } from "./order-delivery";
import { countryOf, invalidProfileFields, newAddressSchema, profileSchema } from "./schemas";

const NP_CITY = { ref: "e718a680-4b33-11e4-ab6d-005056801329", cityRef: "8d5a980d-391c-11dd-90d9-001a92567626", label: "м. Київ" };
const NP_WAREHOUSE = { ref: "1ec09d88-e1c2-11e3-8c4a-0050568002cf", kind: "branch" as const, number: 1, name: "Відділення №1" };
const NP_STREET = { ref: "c55c9056-4148-11dd-9198-001d60451983", label: "вул. Хрещатик" };

describe("profileNames", () => {
  it("keeps saved first and last names, spaces included", () => {
    expect(profileNames({ firstName: "Anna Maria", lastName: "Schmidt", name: "Anna Maria Schmidt" })).toEqual({
      firstName: "Anna Maria",
      lastName: "Schmidt",
    });
  });

  it("keeps a saved first name without a last name", () => {
    expect(profileNames({ firstName: "Olena", lastName: null, name: "Olena Kovalenko" })).toEqual({ firstName: "Olena", lastName: "" });
  });

  it("splits the sign-up name at the first space while neither is saved", () => {
    expect(profileNames({ firstName: null, lastName: null, name: "  Olena  van der Berg " })).toEqual({
      firstName: "Olena",
      lastName: "van der Berg",
    });
    expect(profileNames({ firstName: null, lastName: null, name: null })).toEqual({ firstName: "", lastName: "" });
  });
});

describe("displayName", () => {
  it("joins first and last name within the profile's 100 characters", () => {
    expect(displayName("Anna", "Schmidt")).toBe("Anna Schmidt");
    expect(displayName("Anna", null)).toBe("Anna");
    expect(displayName("a".repeat(100), "b".repeat(100))).toHaveLength(100);
  });
});

describe("profileSchema", () => {
  it("normalizes the phone and turns empty optional fields into null", () => {
    expect(profileSchema.parse({ locale: "en", firstName: " Anna ", lastName: " ", phone: "+49 151 123-456 78" })).toEqual({
      locale: "en",
      firstName: "Anna",
      lastName: null,
      phone: "+4915112345678",
    });
    expect(profileSchema.parse({ locale: "uk", firstName: "Olena", lastName: "", phone: "" }).phone).toBeNull();
  });

  it("names the invalid fields in form order", () => {
    const parsed = profileSchema.safeParse({ locale: "en", firstName: "", lastName: "x".repeat(101), phone: "0501234567" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(invalidProfileFields(parsed.error)).toEqual(["firstName", "lastName", "phone"]);
  });

  it("refuses an unknown locale", () => {
    expect(profileSchema.safeParse({ locale: "ru", firstName: "A", lastName: "", phone: "" }).success).toBe(false);
  });
});

describe("newAddressSchema and countryOf", () => {
  it("takes a checkout delivery choice with an optional label", () => {
    const parsed = newAddressSchema.parse({
      label: "",
      delivery: { kind: "novaPoshtaWarehouse", city: NP_CITY, warehouse: NP_WAREHOUSE },
    });
    expect(parsed.label).toBeNull();
    expect(countryOf(parsed.delivery)).toBe("UA");
    const abroad = newAddressSchema.parse({
      label: "Office",
      delivery: { kind: "novaPostAddress", country: "DE", city: "Berlin", postCode: "10115", street: "Invalidenstr.", building: "1", flat: "" },
    });
    expect(countryOf(abroad.delivery)).toBe("DE");
  });

  it("refuses a UK address and a label over 50 characters", () => {
    expect(
      newAddressSchema.safeParse({
        label: null,
        delivery: { kind: "novaPostAddress", country: "GB", city: "London", postCode: "N1", street: "High St", building: "1", flat: "" },
      }).success,
    ).toBe(false);
    expect(
      newAddressSchema.safeParse({ label: "x".repeat(51), delivery: { kind: "novaPoshtaWarehouse", city: NP_CITY, warehouse: NP_WAREHOUSE } })
        .success,
    ).toBe(false);
  });
});

describe("stored delivery choices", () => {
  it("reads a saved choice back, an empty flat included, and gives it to the form as text", () => {
    const stored = { kind: "novaPoshtaAddress", city: NP_CITY, street: NP_STREET, house: "16А", flat: null };
    const choice = parseStoredChoice(stored);
    expect(choice).toEqual({ ...stored, flat: null });
    expect(toChoiceInput(choice!)).toEqual({ ...stored, flat: "" });
    expect(parseStoredChoice({ kind: "pigeon" })).toBeNull();
    expect(parseStoredChoice(null)).toBeNull();
  });

  it("rebuilds an order's choice from its carrier, method and destination", () => {
    expect(
      choiceFromOrder({ carrier: "nova_poshta", method: "postomat", country: "UA", destination: { city: NP_CITY, warehouse: { ...NP_WAREHOUSE, kind: "postomat" } } }),
    ).toMatchObject({ kind: "novaPoshtaWarehouse", warehouse: { kind: "postomat" } });
    expect(
      choiceFromOrder({ carrier: "nova_poshta", method: "doors", country: "UA", destination: { city: NP_CITY, street: NP_STREET, house: "1", flat: null } }),
    ).toMatchObject({ kind: "novaPoshtaAddress", house: "1", flat: null });
    expect(
      choiceFromOrder({
        carrier: "nova_post",
        method: "division",
        country: "PL",
        destination: {
          settlement: { id: 7, name: "Wrocław" },
          division: { id: 9, number: "1", name: "Wrocław 1", category: "PostBranch", address: "ul. Długa 1" },
        },
      }),
    ).toMatchObject({ kind: "novaPostDivision", country: "PL" });
    expect(choiceFromOrder({ carrier: "nova_post", method: "address", country: "DE", destination: [] })).toBeNull();
    expect(choiceFromOrder({ carrier: "pigeon", method: "address", country: "DE", destination: {} })).toBeNull();
  });
});
