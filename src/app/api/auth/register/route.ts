import { z } from "zod";
import { assertSameOrigin, readJson, success, failure } from "@/lib/api/http";
import { registerPlayer } from "@/server/auth/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    // registerPlayer validates the body itself to report one message per field.
    const input = await readJson(request, z.unknown());
    const user = await registerPlayer(input);
    return success({ id: user.id, message: "Votre compte a été créé." }, 201);
  } catch (error) {
    return failure(error);
  }
}
