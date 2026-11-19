import { failure, success } from "@/lib/api/http";
import { db } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** Liveness and readiness probe for Docker, the orchestrator and uptime monitoring: no session, no rate limit, no detail. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return success({ status: "ok", database: "ok" });
  } catch (error) {
    // Any failure of the probe means "not ready": 503, with the original error in the logs only.
    return failure(error, { unexpectedStatus: 503 });
  }
}
