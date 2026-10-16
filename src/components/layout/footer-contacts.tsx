import { MailIcon, PhoneIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ComponentType, type SVGProps } from "react";
import { getShopContacts } from "@/lib/settings/cache";
import type { ContactChannel, ContactKind } from "@/lib/settings/contacts";
import { InstagramIcon, TelegramIcon, ViberIcon, WhatsAppIcon } from "./contact-icons";

const ICONS: Record<ContactKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  phone: PhoneIcon,
  instagram: InstagramIcon,
  telegram: TelegramIcon,
  viber: ViberIcon,
  whatsapp: WhatsAppIcon,
  email: MailIcon,
};

const linkClass =
  "inline-flex min-h-8 min-w-8 items-center justify-center gap-1.5 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The shop's contact channels from the admin settings (D19): an icon per channel, the phone number and the
 * email written out, the chats as icons named for screen readers. The TBD line while none is configured or
 * the settings cannot be read.
 */
export function FooterContacts() {
  return (
    <Suspense fallback={null}>
      <ContactList />
    </Suspense>
  );
}

/** The same links anywhere else (the order confirmation, #24), with that place's own text while there are none. */
export function ShopContactLinks({ fallback }: { fallback: string }) {
  return (
    <Suspense fallback={null}>
      <ContactList fallback={fallback} />
    </Suspense>
  );
}

async function ContactList({ fallback }: { fallback?: string }) {
  const [contacts, t] = await Promise.all([getShopContacts(), getTranslations("common")]);
  if (!contacts || contacts.channels.length === 0) return fallback ?? t("footer.contactsTbd");

  return contacts.channels.map((channel) => {
    const Icon = ICONS[channel.kind];
    const name = t(`contact.${channel.kind}`);
    // web links open in a new tab and never hand this page to the site they open; tel:, mailto: and viber:// stay
    const external = channel.href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {};
    const text = visibleText(channel);
    return (
      <a
        key={channel.kind}
        href={channel.href}
        data-contact={channel.kind}
        // the channel's name with what is written out ("Phone: +38 …"); a chat is its name alone
        aria-label={text ? `${name}: ${text}` : name}
        className={linkClass}
        {...external}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        {text && <span aria-hidden>{text}</span>}
      </a>
    );
  });
}

// the legacy footer wrote out the phone and the email; the other channels are their icon
function visibleText(channel: ContactChannel): string | null {
  return channel.kind === "phone" || channel.kind === "email" ? channel.text : null;
}
