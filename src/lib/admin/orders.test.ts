import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { destinationOf } = await import("./orders");

describe("an order's destination as the checkout stored it (src/lib/checkout/delivery.ts)", () => {
  const city = { ref: "8d5a980d-391c-11dd-90d9-001a92567626", cityRef: "8d5a980d-391c-11dd-90d9-001a92567626", label: "Київ" };

  it("reads a Nova Poshta branch and a parcel locker", () => {
    const warehouse = { ref: "1ec09d88-e1c2-11e3-8c4a-0050568002cf", kind: "branch", number: 1, name: "Відділення №1" };
    expect(destinationOf("nova_poshta", "warehouse", { city, warehouse })).toEqual({
      kind: "novaPoshtaWarehouse",
      city: "Київ",
      warehouse: "Відділення №1",
      warehouseNumber: 1,
      postomat: false,
    });
    expect(destinationOf("nova_poshta", "postomat", { city, warehouse: { ...warehouse, kind: "postomat" } })).toMatchObject({
      postomat: true,
    });
  });

  it("reads a Nova Poshta courier address", () => {
    expect(
      destinationOf("nova_poshta", "doors", { city, street: { ref: city.ref, label: "вул. Хрещатик" }, house: "1", flat: null }),
    ).toEqual({ kind: "novaPoshtaAddress", city: "Київ", street: "вул. Хрещатик", house: "1", flat: null });
  });

  it("reads a Nova Post division and address", () => {
    expect(
      destinationOf("nova_post", "division", {
        settlement: { id: 1, name: "Berlin" },
        division: { id: 2, number: "1/12", name: "Nova Post 12", category: "PostBranch", address: "Invalidenstr. 1" },
      }),
    ).toEqual({ kind: "novaPostDivision", settlement: "Berlin", division: "Nova Post 12", divisionNumber: "1/12", address: "Invalidenstr. 1" });
    expect(
      destinationOf("nova_post", "address", { city: "Berlin", postCode: "10115", street: "Invalidenstr.", building: "1", flat: "4" }),
    ).toEqual({ kind: "novaPostAddress", city: "Berlin", postCode: "10115", street: "Invalidenstr.", building: "1", flat: "4" });
  });

  it("shows an unknown shape as its stored values instead of dropping it", () => {
    expect(destinationOf("nova_post", "address", { city: "Berlin", zip: 10115, extra: { line: "Hof" } })).toEqual({
      kind: "other",
      values: [
        ["city", "Berlin"],
        ["zip", "10115"],
        ["extra.line", "Hof"],
      ],
    });
  });
});
