import "server-only";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/connexion");
  return session.user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
