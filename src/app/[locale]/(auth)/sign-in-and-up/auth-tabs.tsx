"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormError } from "../_components/form-parts";
import type { FormErrorCode } from "../form-state";
import { GoogleSignIn } from "./google-sign-in";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

type AuthTabsProps = {
  googleEnabled: boolean;
  next?: string;
  // an error carried back in the URL (an invalid email link, an unfinished Google sign-in)
  linkError?: FormErrorCode;
};

// Legacy look: two tabs, Sign In and Sign Up, in a 400px column.
export function AuthTabs({ googleEnabled, next, linkError }: AuthTabsProps) {
  const t = useTranslations("auth");

  return (
    <div className="grid w-full max-w-[400px] gap-6">
      <FormError code={linkError} />
      <Tabs defaultValue="sign-in">
        <TabsList className="w-full">
          <TabsTrigger value="sign-in">{t("signIn.title")}</TabsTrigger>
          <TabsTrigger value="sign-up">{t("signUp.title")}</TabsTrigger>
        </TabsList>
        <TabsContent value="sign-in" className="pt-2">
          <SignInForm next={next} />
        </TabsContent>
        <TabsContent value="sign-up" className="pt-2">
          <SignUpForm />
        </TabsContent>
      </Tabs>
      {googleEnabled ? <GoogleSignIn next={next} /> : null}
    </div>
  );
}
