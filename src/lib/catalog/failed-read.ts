/**
 * The cacheLife of a `"use cache"` entry built from a failed or incomplete read: zero lifetime, so it is
 * never served again and never prerendered (a zero revalidate makes it a dynamic hole resolved at request
 * time, which retries the read). See docs/standards.md, "A failed read is never cached as data".
 */
export const FAILED_READ_LIFE = { stale: 0, revalidate: 0, expire: 0 } as const;
