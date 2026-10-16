import { describe, expect, it } from "vitest";
import { ADMIN_ORDER_STATUSES, canCancel, isOrderStatus, isTransition, nextStatus, ORDER_STATUSES } from "./order-status";

describe("order status transitions (D17, payments off)", () => {
  it("moves forward one step at a time: new → in processing → accepted → closed", () => {
    expect(nextStatus("new")).toBe("in_processing");
    expect(nextStatus("in_processing")).toBe("accepted");
    expect(nextStatus("accepted")).toBe("closed");
    expect(nextStatus("closed")).toBeNull();
    expect(nextStatus("canceled")).toBeNull();
  });

  it("cancels from every open state and from no closed one", () => {
    expect(ADMIN_ORDER_STATUSES.filter(canCancel)).toEqual(["new", "in_processing", "accepted"]);
  });

  it("refuses skips, steps back and the payment states", () => {
    expect(isTransition("new", "in_processing")).toBe(true);
    expect(isTransition("accepted", "canceled")).toBe(true);
    expect(isTransition("new", "accepted")).toBe(false);
    expect(isTransition("accepted", "in_processing")).toBe(false);
    expect(isTransition("closed", "canceled")).toBe(false);
    expect(isTransition("new", "paid")).toBe(false);
    expect(isTransition("canceled", "new")).toBe(false);
  });

  it("offers only the statuses of an order request while payments are off", () => {
    expect(ADMIN_ORDER_STATUSES).not.toContain("pending_payment");
    expect(ADMIN_ORDER_STATUSES).not.toContain("paid");
    expect(ADMIN_ORDER_STATUSES).not.toContain("refunded");
    expect(ADMIN_ORDER_STATUSES.every(isOrderStatus)).toBe(true);
    expect(ORDER_STATUSES).toHaveLength(8);
    expect(isOrderStatus("shipped")).toBe(false);
  });
});
