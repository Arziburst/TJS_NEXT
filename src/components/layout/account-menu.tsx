import { getTranslations } from "next-intl/server";
import { getCurrentUser, SessionUnavailableError, type CurrentUser } from "@/lib/auth/session";
import { testErrorRequested } from "@/lib/test-error";
import { AccountMenuClient } from "./account-menu-client";
import { AccountSlot, AccountUnavailableSlot } from "./header-slots";

/**
 * The header's account slot: the sign-in link for a guest, the account menu for a signed-in user. Reads the
 * session, so it renders behind a Suspense boundary (SiteShell) and the rest of the shell stays static.
 * While the session cannot be read (an Auth outage, #112) the slot degrades to the sign-in link with a hint to
 * try again: the header is in the root layout, and a failure here would take down every page, not only the
 * account and admin pages, which show their own error page.
 */
export async function AccountMenu() {
  if (await testErrorRequested("shell")) throw new Error("test-only failure of the header (#112)");
  let user: CurrentUser | null;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof SessionUnavailableError) return <AccountUnavailableSlot />;
    throw error;
  }
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
