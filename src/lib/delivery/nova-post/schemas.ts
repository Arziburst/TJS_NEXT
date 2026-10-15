import { z } from "zod";

// The parts of the api.novapost.com v1.0 answers the shop reads (OpenAPI spec at
// api.novapost.com/developers/spec.yaml and api-portal.novapost.com). Unknown fields are ignored.

export const authorizationSchema = z.object({ jwt: z.string().min(1) });

const regionSchema = z
  .object({
    name: z.string(),
    parent: z.object({ name: z.string() }).nullish(),
  })
  .nullish();

export const settlementsSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      region: regionSchema,
      // true: Nova Post delivers nothing to this settlement
      prohibitedIssuance: z.boolean().nullish(),
    }),
  ),
});

export const divisionsSchema = z.object({
  current_page: z.number().int().min(0),
  last_page: z.number().int().min(0),
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      number: z.string(),
      name: z.string().min(1),
      divisionCategory: z.string(),
      address: z.string().nullish(),
      status: z.string().nullish(),
    }),
  ),
});

export const calculationSchema = z.object({
  scheduledDeliveryDate: z.string().nullish(),
  services: z
    .array(
      z.object({
        cost: z.number().nonnegative(),
        // the spec's example omits it on some services; the services of one calculation share one currency
        currencyCode: z.string().regex(/^[A-Z]{3}$/).nullish(),
      }),
    )
    .min(1),
});

// The gateway's error body: { "errors": { "<field or errorMessage>": "<text>" } }
export const errorSchema = z.object({ errors: z.record(z.string(), z.unknown()) });
