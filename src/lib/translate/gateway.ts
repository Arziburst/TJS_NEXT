import "server-only";

import { createGateway, type LanguageModel } from "ai";
import { TRANSLATION_MODEL } from "./core";

/*
 * The translation model through the Vercel AI Gateway. Server-only: the key never reaches a client bundle.
 * Translation is on when it has a credential: AI_GATEWAY_API_KEY (local development, CI against a mock), or
 * AI_GATEWAY_OIDC=true on Vercel, where the gateway authenticates with the deployment's OIDC token. Without
 * either the admin shows "translation is not configured" and no action calls out.
 */

type Env = Record<string, string | undefined>;

/** The model to translate with, or null when translation is not configured. Read at request time. */
export function translationModel(env: Env = process.env): LanguageModel | null {
  const apiKey = env.AI_GATEWAY_API_KEY?.trim() || undefined;
  if (!apiKey && env.AI_GATEWAY_OIDC !== "true") return null;
  // the e2e mock and local experiments point elsewhere; production always talks to the real gateway
  const baseURL = env.VERCEL_ENV === "production" ? undefined : env.AI_GATEWAY_BASE_URL?.trim() || undefined;
  return createGateway({ apiKey, baseURL })(TRANSLATION_MODEL);
}

export function isTranslationConfigured(env: Env = process.env): boolean {
  return translationModel(env) !== null;
}
