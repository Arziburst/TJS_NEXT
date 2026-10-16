import type { Instrumentation } from "next";
import { reportServerError } from "@/lib/monitoring/report";
import { requestIdOf } from "@/lib/monitoring/request-id";

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
