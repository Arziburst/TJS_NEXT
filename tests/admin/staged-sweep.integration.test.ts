// The daily sweep of abandoned photo uploads (#92) over the Storage API of the local stack: a staged file is
// kept while it is young and removed once it is older than a day; the cron route answers 401 without
// CRON_SECRET. The stack part is skipped without a local stack.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));

const HOUR = 60 * 60 * 1000;

describe("the staged-uploads cron route", () => {
  it("answers 401 without the cron secret, or with another one", async () => {
    vi.stubEnv("CRON_SECRET", "the-secret");
    const { GET } = await import("@/app/api/cron/staged-uploads/route");
    for (const headers of [new Headers(), new Headers({ authorization: "Bearer other" }), new Headers({ authorization: "the-secret" })]) {
      const response = await GET(new Request("http://localhost/api/cron/staged-uploads", { headers }));
      expect(response.status).toBe(401);
    }
    vi.unstubAllEnvs();
  });
});

const stack = localStack();

describe.skipIf(!stack)("the staged-uploads sweep on the local stack", async () => {
  if (!stack) return;
  const { STAGING_BUCKET, STAGED_UPLOAD_MAX_AGE_MS, sweepStagedUploads } = await import("@/lib/admin/staged-sweep");
  const service = createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });
  // two "admins'" folders of this test only: the sweep never touches another test's staged files
  const folders = [crypto.randomUUID(), crypto.randomUUID()];
  const files = folders.map((folder) => `${folder}/${crypto.randomUUID()}`);

  async function staged(): Promise<string[]> {
    const names = [];
    for (const folder of folders) {
      const { data } = await service.storage.from(STAGING_BUCKET).list(folder);
      names.push(...(data ?? []).map((f) => `${folder}/${f.name}`));
    }
    return names.sort();
  }

  beforeAll(async () => {
    for (const path of files) {
      const { error } = await service.storage.from(STAGING_BUCKET).upload(path, Buffer.from("abandoned"), {
        contentType: "application/octet-stream",
      });
      if (error) throw error;
    }
  });

  afterAll(async () => {
    const left = await staged();
    if (left.length) await service.storage.from(STAGING_BUCKET).remove(left);
  });

  it("keeps the files of the last day", async () => {
    const result = await sweepStagedUploads(service, { now: new Date(), folders });
    expect(result).toEqual({ status: "ok", checked: 2, removed: 0 });
    // an hour before the limit: still kept
    const almost = await sweepStagedUploads(service, { now: new Date(Date.now() + STAGED_UPLOAD_MAX_AGE_MS - HOUR), folders });
    expect(almost).toEqual({ status: "ok", checked: 2, removed: 0 });
    expect(await staged()).toEqual([...files].sort());
  });

  it("removes the files older than a day", async () => {
    const result = await sweepStagedUploads(service, { now: new Date(Date.now() + STAGED_UPLOAD_MAX_AGE_MS + HOUR), folders });
    expect(result).toEqual({ status: "ok", checked: 2, removed: 2 });
    expect(await staged()).toEqual([]);
  });
});
