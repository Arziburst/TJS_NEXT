import type { DeliveryChoice } from "@/lib/checkout/schema";

// No "server-only" and no hooks: the account pages and the checkout both describe a destination with these.

export type DeliveryKindLabel = "novaPoshtaBranch" | "novaPoshtaPostomat" | "novaPoshtaAddress" | "novaPostDivision" | "novaPostAddress";

/** The service of a destination, as `account.addresses.kinds.<key>` names it. */
export function deliveryKind(choice: DeliveryChoice): DeliveryKindLabel {
  if (choice.kind === "novaPoshtaWarehouse") return choice.warehouse.kind === "postomat" ? "novaPoshtaPostomat" : "novaPoshtaBranch";
  return choice.kind;
}

/** The two lines of a destination as the customer reads it back: the point or street, then the place. */
export function deliveryLines(choice: DeliveryChoice, countryName: (code: string) => string): [string, string] {
  switch (choice.kind) {
    case "novaPoshtaWarehouse":
      return [choice.warehouse.name, choice.city.label];
    case "novaPoshtaAddress":
      return [[choice.street.label, choice.house, choice.flat].filter(Boolean).join(", "), choice.city.label];
    case "novaPostDivision":
      return [
        [choice.division.name, choice.division.address].filter(Boolean).join(", "),
        `${choice.settlement.name}, ${countryName(choice.country)}`,
      ];
    case "novaPostAddress":
      return [
        [choice.street, choice.building, choice.flat].filter(Boolean).join(", "),
        `${choice.postCode} ${choice.city}, ${countryName(choice.country)}`,
      ];
  }
}

/** Nova Poshta names come from its Ukrainian dictionary. */
export function deliveryLang(choice: DeliveryChoice): "uk" | undefined {
  return choice.kind === "novaPoshtaWarehouse" || choice.kind === "novaPoshtaAddress" ? "uk" : undefined;
}
