import { getCurrentUser } from "@/lib/auth/session";
import { AccountMenuClient } from "./account-menu-client";
import { AccountSlot } from "./header-slots";

/**
 * The header's account slot: the sign-in link for a guest, the account menu for a signed-in user. Reads the
 * session, so it renders behind a Suspense boundary (SiteShell) and the rest of the shell stays static.
 */
export async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) return <AccountSlot />;
  const displayName = user.name ?? user.email ?? "";
  return <AccountMenuClient displayName={displayName} />;
}
