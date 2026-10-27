import {encode} from "next-auth/jwt";
/** Test-only signed cookie; assertions still execute real DB role checks. */
export async function sessionCookie(userId:string,url:string) {
  const name="authjs.session-token";
  const value=await encode({token:{sub:userId},secret:process.env.AUTH_SECRET??"local-playwright-secret-for-tests-only-32chars",salt:name,maxAge:600});
  return {name,value,url,httpOnly:true,sameSite:"Lax" as const};
}
