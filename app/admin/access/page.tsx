import AdminAccess from "@/components/admin-access";
import { getAdminAccessUsers } from "@/lib/admin";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Access · Conventus" };

export default async function AdminAccessPage() {
  const session = await getSession();
  if (!session || session.role !== "PLATFORM_ADMIN") {
    return null;
  }

  const users = await getAdminAccessUsers();
  return <AdminAccess users={users} currentUserId={session.userId} />;
}
