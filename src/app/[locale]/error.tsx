"use client";

import { ErrorView, type ErrorBoundaryProps } from "@/components/errors/error-view";

// The storefront's error page (#112): a page that fails, inside the shop's header and footer.
export default function SegmentError(props: ErrorBoundaryProps) {
  return <ErrorView {...props} />;
}
