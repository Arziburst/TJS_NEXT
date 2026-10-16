import { describe, expect, it } from "vitest";
import { deliveryKind, deliveryLang, deliveryLines } from "./delivery-lines";

const country = (code: string) => ({ DE: "Germany", PL: "Poland" })[code] ?? code;
const city = { ref: "e718a680-4b33-11e4-ab6d-005056801329", cityRef: "8d5a980d-391c-11dd-90d9-001a92567626", label: "м. Київ" };

describe("delivery lines", () => {
  it("describes a Nova Poshta parcel locker in Ukrainian names", () => {
    const choice = {
      kind: "novaPoshtaWarehouse" as const,
      city,
      warehouse: { ref: city.ref, kind: "postomat" as const, number: 5, name: "Поштомат №5" },
    };
    expect(deliveryKind(choice)).toBe("novaPoshtaPostomat");
    expect(deliveryLines(choice, country)).toEqual(["Поштомат №5", "м. Київ"]);
    expect(deliveryLang(choice)).toBe("uk");
  });

  it("describes a courier address abroad with the country's name", () => {
    const choice = {
      kind: "novaPostAddress" as const,
      country: "DE" as const,
      city: "Berlin",
      postCode: "10115",
      street: "Invalidenstr.",
      building: "1",
      flat: null,
    };
    expect(deliveryKind(choice)).toBe("novaPostAddress");
    expect(deliveryLines(choice, country)).toEqual(["Invalidenstr., 1", "10115 Berlin, Germany"]);
    expect(deliveryLang(choice)).toBeUndefined();
  });
});
