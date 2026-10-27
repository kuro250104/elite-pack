import { assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { registrationSchema } from "@/server/auth/validation";
import { registerPlayer } from "@/server/auth/service";
import { ApiError } from "@/lib/api/errors";
const accepted = () => success({message:"La demande a été traitée. Vous pouvez essayer de vous connecter."},201);
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readJson(request,registrationSchema);
    await registerPlayer(input);
    return accepted();
  } catch(error) {
    if(error instanceof ApiError && error.code==="REGISTRATION_UNAVAILABLE")return accepted();
    return failure(error);
  }
}
