import type { Instrumentation } from "next";
import { logger, serializeError } from "@/lib/logger";

/**
 * Server errors that do not go through the API failure() helper (Server Component rendering,
 * Server Actions, unexpected crashes): logged once, with the digest shown to the user on the error page.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  logger.error("Erreur non gérée côté serveur", {
    digest, method: request.method, path: request.path.split("?")[0],
    routePath: context.routePath, routeType: context.routeType, error: serializeError(error),
  });
};
