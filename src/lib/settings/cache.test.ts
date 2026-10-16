import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AboutContent } from "./about";
import type { PublicShopSettings } from "./contacts";

vi.mock("server-only", () => ({}));

// The "use cache" directive is a plain string outside Next's compiler: the spies record the entry's lifetime
const cacheLife = vi.fn();
const cacheTag = vi.fn();
vi.mock("next/cache", () => ({ cacheLife, cacheTag }));

const readPublicShopSettings = vi.fn<() => Promise<PublicShopSettings>>();
const readPublicAbout = vi.fn<() => Promise<AboutContent>>();
vi.mock("./store", () => ({
  readPublicShopSettings: () => readPublicShopSettings(),
  readPublicAbout: () => readPublicAbout(),
}));

const { FAILED_READ_LIFE } = await import("@/lib/failed-read");
const { getAboutContent, getShopContacts, ABOUT_TAG, SHOP_SETTINGS_TAG } = await import("./cache");

const EMPTY: PublicShopSettings = {
  shop_name: null,
  instagram_handle: "tjs",
  email: null,
  phone: null,
  telegram_url: null,
  viber_url: null,
  whatsapp_url: null,
};

beforeEach(() => {
  cacheLife.mockClear();
  cacheTag.mockClear();
  readPublicShopSettings.mockReset();
  readPublicAbout.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getShopContacts", () => {
  it("caches a failed read with zero lifetime", async () => {
    readPublicShopSettings.mockRejectedValue(new TypeError("fetch failed"));
    expect(await getShopContacts()).toBeNull();
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("keeps the contacts for a day without a stale window, tagged for the admin's save", async () => {
    readPublicShopSettings.mockResolvedValue(EMPTY);
    expect(await getShopContacts()).toEqual({
      shopName: null,
      channels: [{ kind: "instagram", href: "https://www.instagram.com/tjs/", text: "@tjs" }],
    });
    expect(cacheLife.mock.calls).toEqual([["daysNoSwr"]]);
    expect(cacheTag).toHaveBeenCalledWith(SHOP_SETTINGS_TAG);
  });
});

describe("getAboutContent", () => {
  it("caches a failed read with zero lifetime", async () => {
    readPublicAbout.mockRejectedValue(new TypeError("fetch failed"));
    expect(await getAboutContent()).toBeNull();
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("keeps the page for a day without a stale window, tagged for the admin's save", async () => {
    const content: AboutContent = { published: false, translations: [] };
    readPublicAbout.mockResolvedValue(content);
    expect(await getAboutContent()).toBe(content);
    expect(cacheLife.mock.calls).toEqual([["daysNoSwr"]]);
    expect(cacheTag).toHaveBeenCalledWith(ABOUT_TAG);
  });
});
