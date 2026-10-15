"use client";

import { Menu } from "@base-ui/react/menu";
import { LogOutIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type AccountMenuClientProps = {
  // what the menu shows: the profile name, else the email
  displayName: string;
  className?: string;
};

// Legacy avatar: the first two letters of the name.
function initials(displayName: string): string {
  return displayName.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();
}

/** The signed-in user's menu in the header's account slot: who is signed in, and sign-out. */
export function AccountMenuClient({ displayName, className }: AccountMenuClientProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={signOut} hidden>
        <input type="hidden" name="locale" value={locale} />
      </form>
      <Menu.Root modal>
        <Menu.Trigger
          aria-label={t("account")}
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
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="min-w-56 border-2 border-primary bg-background p-1 font-sans text-sm text-foreground outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 transition-opacity">
              <Menu.Group>
                <Menu.GroupLabel className="grid gap-0.5 px-3 py-2">
                  <span className="font-input text-xs opacity-70">{t("signedInAs")}</span>
                  <span className="truncate font-semibold" data-testid="account-name">
                    {displayName}
                  </span>
                </Menu.GroupLabel>
              </Menu.Group>
              <Menu.Separator className="my-1 h-0.5 bg-hairline" />
              <Menu.Item
                onClick={() => formRef.current?.requestSubmit()}
                className="flex cursor-pointer items-center gap-2 px-3 py-2.5 outline-none select-none data-highlighted:bg-primary data-highlighted:text-primary-foreground"
              >
                <LogOutIcon aria-hidden className="size-4" />
                {t("logout")}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
