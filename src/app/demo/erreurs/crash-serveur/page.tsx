import { notFound } from "next/navigation";
import { errorDemoEnabled } from "@/server/demo/errors";

export const dynamic = "force-dynamic";

/** Server Component crash: caught by app/error.tsx (reference shown) and logged by instrumentation.ts. */
export default function ServerCrashDemoPage() {
  if (!errorDemoEnabled()) notFound();
  throw new Error("Démonstration : plantage d’un composant serveur pendant le rendu.");
}
