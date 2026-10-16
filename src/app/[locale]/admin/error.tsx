"use client";

import { ErrorView, type ErrorBoundaryProps } from "@/components/errors/error-view";

// The admin pages' error page (#112): a failed session read or load, inside the shop's header and footer.
export default function SegmentError(props: ErrorBoundaryProps) {
  return <ErrorView {...props} />;
}
