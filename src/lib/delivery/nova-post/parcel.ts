import type { Parcel } from "./types";

/*
 * The parcel a live quote is asked for: packaging (box size and weight), the declared value rule and the
 * insured value are the owner's decisions and not made yet (TBD, docs/decisions.md has none). Until they
 * are, no parcel exists, so the live calculation is not asked and the zone flat rate is shown instead;
 * settlements and divisions still come from the API once its key is set.
 */
export function parcelForOrder(): Parcel | null {
  return null;
}
