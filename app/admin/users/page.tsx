import AdminUsers from "@/components/admin-users";
import { getAdminUsers } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await getAdminUsers();
  return <AdminUsers users={users} />;
}
