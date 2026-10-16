/*
 * The shop's toasts without sonner in the first load (#105): each call imports sonner (one chunk, shared with
 * the toaster) and asks the LazyToaster to mount. Sonner hands the toasts made before its Toaster subscribed to
 * it when it does, so none is lost. Every toast goes through here (ESLint keeps sonner out of other modules):
 * the toaster mounts only for a toast, never as a state update while the page may still be hydrating.
 */

type Kind = "message" | "success" | "info" | "error";

const toasterRequests = new Set<() => void>();

/** LazyToaster's subscription: called when a toast is about to show. */
export function onToasterRequest(listener: () => void): () => void {
  toasterRequests.add(listener);
  return () => {
    toasterRequests.delete(listener);
  };
}

function show(kind: Kind, message: string) {
  toasterRequests.forEach((listener) => listener());
  // eslint-disable-next-line no-restricted-syntax -- the one module that loads sonner (eslint.config.mjs, #105)
  void import("sonner").then(({ toast }) => (kind === "message" ? toast(message) : toast[kind](message)));
}

export const toast = Object.assign((message: string) => show("message", message), {
  success: (message: string) => show("success", message),
  info: (message: string) => show("info", message),
  error: (message: string) => show("error", message),
});
