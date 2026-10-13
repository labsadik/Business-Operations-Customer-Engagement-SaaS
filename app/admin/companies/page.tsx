import AdminCompanies from "@/components/admin-companies";
import { getAdminCompanies } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const page = await getAdminCompanies({ search: params.q ?? "", limit: 5 });
  return <AdminCompanies companies={page.items} nextCursor={page.nextCursor} />;
}
