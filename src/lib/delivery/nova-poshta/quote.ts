import "server-only";

import type { NovaPoshtaClient } from "./api";
import { PACKAGING_VOLUME_CM3, SENDER_CITY_REF, serviceType, type Parcel, type RecipientService } from "./parcel";
import type { QuoteResult } from "./types";

// The Nova Poshta tariff for the parcel in the standard box (D37) from the shop (Kyiv, D35) to the recipient's city
export async function quoteDelivery(
  { cityRef, recipient, parcel }: { cityRef: string; recipient: RecipientService; parcel: Parcel },
  { client }: { client: NovaPoshtaClient },
): Promise<QuoteResult> {
  const result = await client.getDocumentPrice({
    citySenderRef: SENDER_CITY_REF,
    cityRecipientRef: cityRef,
    serviceType: serviceType(recipient),
    weightGrams: parcel.weightGrams,
    volumeCm3: PACKAGING_VOLUME_CM3,
    declaredValueMinor: parcel.declaredValueMinor,
  });
  if (result.ok) return { ok: true, costMinor: result.data.costMinor };
  console.error("nova-poshta: quote", JSON.stringify(result.error));
  return { ok: false, reason: "unavailable" };
}
