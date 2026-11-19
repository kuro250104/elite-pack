import { ApiError } from "@/lib/api/errors";
import { failure, success } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** Liveness and readiness probe for Docker, the orchestrator and uptime monitoring: no session, no rate limit, no detail. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return success({ status: "ok", database: "ok" });
  } catch (error) {
    if (error instanceof ApiError) return failure(error);
    return failure(new ApiError("SERVICE_UNAVAILABLE", "Le service est temporairement indisponible.", 503));
  }
}
