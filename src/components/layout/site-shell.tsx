import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Footer } from "./footer";
import { Header } from "./header";

// Header, page, footer and the toast region. Pages render their own <main>.
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header menuFooter={<Footer />} />
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
      <Toaster />
    </>
  );
}
