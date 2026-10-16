import { getTranslations } from "next-intl/server";
import { getCurrentUser, unlessSessionUnavailable } from "@/lib/auth/session";
import { testErrorRequested } from "@/lib/test-error";
import { AccountMenuClient } from "./account-menu-client";
import { AccountSlot, AccountUnavailableSlot } from "./header-slots";

/**
 * The header's account slot: the sign-in link for a guest, the account menu for a signed-in user. Reads the
 * session, so it renders behind a Suspense boundary (SiteShell) and the rest of the shell stays static.
 * While the session cannot be read (an Auth outage, #112) it is the sign-in link with a hint to try again: the
 * header is in the root layout, and failing here would fail every page.
 */
export async function AccountMenu() {
  if (await testErrorRequested("shell")) throw new Error("test-only failure of the header (#112)");
  const user = await unlessSessionUnavailable(getCurrentUser(), "unavailable" as const);
  if (user === "unavailable") return <AccountUnavailableSlot />;
  if (!user) return <AccountSlot />;
  const displayName = user.name ?? user.email ?? "";
  if (user.role !== "admin") return <AccountMenuClient displayName={displayName} savedLocale={user.locale} />;
  const t = await getTranslations("admin");
  return (
    <AccountMenuClient
      displayName={displayName}
      savedLocale={user.locale}
      adminLinks={{ admin: t("shell.nav"), addProduct: t("list.add") }}
    />
  );
}
