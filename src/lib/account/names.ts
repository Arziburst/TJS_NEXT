// No "server-only": a pure helper, unit-tested.

export type ContactNames = { firstName: string; lastName: string };

/**
 * The first and last name of a profile. Saved ones win; a profile that never had them (a sign-up's "Name and
 * surname", a Google name) is split at the first space: "Olena Kovalenko" → "Olena" + "Kovalenko".
 */
export function profileNames(profile: { firstName: string | null; lastName: string | null; name: string | null }): ContactNames {
  if (profile.firstName !== null || profile.lastName !== null) {
    return { firstName: profile.firstName ?? "", lastName: profile.lastName ?? "" };
  }
  const [first = "", ...rest] = (profile.name ?? "").trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

/** The display name kept in profiles.name (the account menu): "first last", within its 100 characters. */
export function displayName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").slice(0, 100).trim();
}
