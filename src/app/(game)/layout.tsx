import { requireUser } from "@/lib/auth/authorization";
export default async function GameLayout({children}: {children: React.ReactNode}) {await requireUser(); return children;}
