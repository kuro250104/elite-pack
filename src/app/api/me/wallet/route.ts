import { failure, requireApiUser, success } from "@/lib/api/http";
import { reserveGameRequest } from "@/server/game/api";
import { getWalletHistory } from "@/server/wallet/history";

export async function GET(request: Request) {
  try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    return success(await getWalletHistory(actor.id, Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) {
    return failure(error);
  }
}
