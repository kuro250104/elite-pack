import { assertSameOrigin, failure, requireApiUser, success } from "@/lib/api/http";
import { reserveGameRequest } from "@/server/game/api";
import { removeFromWishlist } from "@/server/wishlist/service";

export async function DELETE(request: Request, context: { params: Promise<{ editionId: string }> }) {
  try {
    const actor = await requireApiUser();
    assertSameOrigin(request);
    await reserveGameRequest(actor.id, true);
    const { editionId } = await context.params;
    return success(await removeFromWishlist(actor.id, editionId));
  } catch (error) {
    return failure(error);
  }
}
