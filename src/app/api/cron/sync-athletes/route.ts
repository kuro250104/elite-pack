import { timingSafeEqual } from "node:crypto";
import { success, failure } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { syncAthletes } from "@/server/imports/sync";
export const maxDuration = 60;
// Called by the scheduler (vercel.json) with "Authorization: Bearer CRON_SECRET"; runs as the administrator SYNC_ACTOR_ID.
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET, actorId = process.env.SYNC_ACTOR_ID;
    if (!secret || secret.length < 16 || !actorId) throw new ApiError("SYNC_NOT_CONFIGURED", "La synchronisation planifiée n’est pas configurée.", 503);
    const supplied = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ApiError("UNAUTHENTICATED", "Accès refusé.", 401);
    const summary = await syncAthletes(actorId);
    // Names and per-athlete details stay in the audit log; the scheduler only needs the counts.
    return success({ candidates: summary.candidates, processed: summary.processed, updated: summary.updated, failed: summary.failed, stoppedByQuota: summary.stoppedByQuota });
  } catch (error) {return failure(error);}
}
