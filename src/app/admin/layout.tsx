import { requireAdmin } from "@/lib/auth/authorization";
export default async function AdminLayout({children}: {children: React.ReactNode}) {await requireAdmin(); return children;}
