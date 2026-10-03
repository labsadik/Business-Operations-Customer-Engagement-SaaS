import AdminOverview from "@/components/admin-overview";
import { getAdminOverview } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const data = await getAdminOverview();
  return <AdminOverview data={data} />;
}
