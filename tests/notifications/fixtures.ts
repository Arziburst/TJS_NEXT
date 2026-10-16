import type { NotificationOrder } from "@/lib/notifications/order";

// Orders for the notification tests: one to a Nova Poshta branch in Kyiv (UAH) and one by courier to Berlin
// (EUR), with the characters a template must escape in every field a customer types.

export function kyivBranchOrder(overrides: Partial<NotificationOrder> = {}): NotificationOrder {
  return {
    id: "6f0c3c1e-1d1b-4a6e-9a51-1c8f6a0b2a10",
    number: 10042,
    status: "new",
    createdAt: "2026-10-16T09:05:00Z",
    locale: "uk",
    firstName: "Олена <b>",
    lastName: "Коваль & Co",
    phone: "+380501234567",
    email: "olena@example.test",
    comment: "Подарункове пакування, будь ласка <script>alert(1)</script> & дякую > 1",
    country: "UA",
    carrier: "nova_poshta",
    method: "warehouse",
    destination: { kind: "point", place: "Київ", point: "Відділення №1: вул. Пирогівський шлях, 135" },
    estimate: { state: "amount", currency: "UAH", amountMinor: 80_00, decimals: 2 },
    currency: "UAH",
    decimals: 2,
    totalMinor: 2_578_00 + 1_529_00,
    totalUsdMinor: 21_00 * 2 + 37_00,
    lines: [
      { title: "Сережки «Корали» <i>", titleLocale: "uk", quantity: 2, lineMinor: 2_578_00 },
      { title: "Брошка Тюльпан & Ко", titleLocale: "uk", quantity: 1, lineMinor: 1_529_00 },
    ],
    ...overrides,
  };
}

export function berlinCourierOrder(overrides: Partial<NotificationOrder> = {}): NotificationOrder {
  return {
    id: "0b8a4f62-3c55-4b1d-8a0e-2f0b7d6c9e21",
    number: 10043,
    status: "new",
    createdAt: "2026-10-16T18:40:00Z",
    locale: "de",
    firstName: "Jürgen",
    lastName: null,
    phone: "+4915112345678",
    email: "juergen@example.test",
    comment: null,
    country: "DE",
    carrier: "nova_post",
    method: "address",
    destination: { kind: "address", place: "Berlin", postCode: "10115", street: "Invalidenstr.", house: "1", flat: "3 <a>" },
    estimate: { state: "tbd" },
    currency: "EUR",
    decimals: 2,
    totalMinor: 29_90,
    totalUsdMinor: 31_00,
    lines: [{ title: "Ring Koralle", titleLocale: "de", quantity: 1, lineMinor: 29_90 }],
    ...overrides,
  };
}
