import { Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AccountMenu } from "./account-menu";
import { Footer } from "./footer";
import { Header } from "./header";
import { AccountSlot } from "./header-slots";

// Header, page, footer and the toast region. Pages render their own <main>.
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header
        account={
          <Suspense fallback={<AccountSlot />}>
            <AccountMenu />
          </Suspense>
        }
        menuFooter={<Footer />}
      />
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
      <Toaster />
    </>
  );
}
