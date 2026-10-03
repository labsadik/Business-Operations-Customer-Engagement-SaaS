import { redirect } from "next/navigation";
import AdminShell from "@/components/admin-shell";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Console · Conventus" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");
  if (session.role !== "PLATFORM_ADMIN") redirect("/dashboard");

  return (
    <AdminShell user={{ name: session.name, email: session.email, image: session.image }}>
      {children}
    </AdminShell>
  );
}
