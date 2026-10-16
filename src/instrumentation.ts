import type { Instrumentation } from "next";
import { reportServerError } from "@/lib/monitoring/report";
import { requestIdOf } from "@/lib/monitoring/request-id";

// Once per server instance, before it serves: whatever Next, Node or a library prints with console.error or
// console.warn (Next's own line for a captured error, an unhandled rejection) is masked like the structured
// event below (src/lib/monitoring/console.ts). The Node.js runtime only: the proxy and pages run there.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { maskConsole } = await import("@/lib/monitoring/console");
  maskConsole();
}

// Every server error Next captures (pages, route handlers, Server Actions, the proxy): src/lib/monitoring/report.ts
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await reportServerError(error, {
    requestId: requestIdOf(request.headers),
    method: request.method,
    path: request.path,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
