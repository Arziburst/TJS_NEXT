"use client";

import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { rememberLocale } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type AccountMenuClientProps = {
  // what the menu shows: the profile name, else the email
  displayName: string;
  // an admin's entries with their labels, given by the server only for an admin (the role comes from the
  // database; the admin pages check it again), so no other visitor receives them
  adminLinks?: { admin: string; addProduct: string };
  // the language stored for Auth's emails (#99); the menu stores the page's locale when it differs
  savedLocale: Locale | null;
  className?: string;
};

// the locale last sent from this tab: the header renders the menu twice (desktop, mobile sheet), it goes once
let sentLocale: string | null = null;

// Base UI's menu and its positioning load on first use (#105), as the sheets do (lazy-sheet.ts)
const loadPopup = () => import("./account-menu-popup");
const AccountMenuPopup = dynamic(() => loadPopup().then((module) => module.AccountMenuPopup), { ssr: false });

// Legacy avatar: the first two letters of the name.
function initials(displayName: string): string {
  return displayName.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();
}

/** The signed-in user's menu in the header's account slot: who is signed in, their account pages, sign-out. */
export function AccountMenuClient({ displayName, adminLinks, savedLocale, className }: AccountMenuClientProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const preload = () => void loadPopup();

  // A signed-in user who reads the shop in another language gets Auth's emails in it from now on. Only a
  // difference from a stored locale calls the server, which checks the session and the rate limit itself. An
  // account without one (signed up before #99, with Google, or made by an admin) is left alone: its emails
  // follow the page they are asked from.
  useEffect(() => {
    if (savedLocale === null || locale === savedLocale || locale === sentLocale) return;
    sentLocale = locale;
    void rememberLocale(locale);
  }, [locale, savedLocale]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("account")}
        // what Base UI's menu trigger announces
        aria-haspopup="menu"
        aria-expanded={open}
        data-popup-open={open ? "" : undefined}
        onPointerEnter={preload}
        onTouchStart={preload}
        onFocus={preload}
        onClick={(event) => {
          // the mobile menu sheet closes on clicks in its account slot (meant for links); this one only opens
          // the account menu, so the sheet stays
          event.stopPropagation();
          setMounted(true);
          setOpen(true);
        }}
        className={cn(
          "inline-flex size-11 items-center justify-center transition-opacity outline-none hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:opacity-70",
          className,
        )}
      >
        <span
          aria-hidden
          className="inline-flex size-9 items-center justify-center rounded-full border-2 border-primary font-sans text-xs font-semibold"
        >
          {initials(displayName)}
        </span>
      </button>
      {mounted && (
        <AccountMenuPopup
          open={open}
          onOpenChange={setOpen}
          trigger={triggerRef}
          displayName={displayName}
          adminLinks={adminLinks}
        />
      )}
    </>
  );
}
