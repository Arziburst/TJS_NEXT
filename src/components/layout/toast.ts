/*
 * The shop's toasts without sonner in the first load (#105): each call imports sonner (one chunk, shared with
 * the toaster) and asks the LazyToaster to mount. Sonner hands the toasts made before its Toaster subscribed to
 * it when it does, so none is lost. Storefront components use this; the admin pages may use sonner directly.
 */

type Kind = "success" | "info" | "error";

const toasterRequests = new Set<() => void>();

/** LazyToaster's subscription: called when a toast is about to show. */
export function onToasterRequest(listener: () => void): () => void {
  toasterRequests.add(listener);
  return () => toasterRequests.delete(listener);
}

function show(kind: Kind, message: string) {
  toasterRequests.forEach((listener) => listener());
  void import("sonner").then(({ toast }) => toast[kind](message));
}

export const toast = {
  success: (message: string) => show("success", message),
  info: (message: string) => show("info", message),
  error: (message: string) => show("error", message),
};
