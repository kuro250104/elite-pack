import { assertSameOrigin, failure, readJson, requireApiUser, success } from "@/lib/api/http";
import { reserveGameRequest } from "@/server/game/api";
import { addToWishlist, listWishlist, wishlistAddSchema } from "@/server/wishlist/service";

export async function GET(request: Request) {
  try {
    const actor = await requireApiUser();
    await reserveGameRequest(actor.id);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return success(await listWishlist(actor.id, query));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    const input = await readJson(request, wishlistAddSchema);
    await reserveGameRequest(actor.id, true);
    const result = await addToWishlist(actor.id, input);
    return success(result, result.created ? 201 : 200);
  } catch (error) {
    return failure(error);
  }
}
