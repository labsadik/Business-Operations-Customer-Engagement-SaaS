import AdminUsers from "@/components/admin-users";
import { getAdminUsers } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const page = await getAdminUsers({ limit: 5 });
  return <AdminUsers users={page.items} nextCursor={page.nextCursor} />;
}
