import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

// The auth forms are client components: they get only the namespaces they use.
export async function AuthMessages({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={{
        auth: messages.auth,
        errors: { form: messages.errors.form },
        common: { fields: messages.common.fields },
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
