import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/admin/order-status";
import { cn } from "@/lib/utils";

// The legacy colours (canceled coral, in processing yellow, accepted green, closed plain); a new request is
// the filled brown that draws the eye first.
const VARIANTS = {
  new: "default",
  pending_payment: "outline",
  paid: "success",
  in_processing: "warning",
  accepted: "success",
  closed: "outline",
  canceled: "accent",
  refunded: "outline",
} as const satisfies Record<OrderStatus, "default" | "outline" | "success" | "warning" | "accent">;

export function OrderStatusBadge({ status, label, className }: { status: OrderStatus; label: string; className?: string }) {
  return (
    <Badge variant={VARIANTS[status]} data-status={status} data-testid="order-status" className={cn("rounded-none", className)}>
      {label}
    </Badge>
  );
}
