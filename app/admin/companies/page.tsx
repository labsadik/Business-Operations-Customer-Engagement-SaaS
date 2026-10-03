import AdminCompanies from "@/components/admin-companies";
import { getAdminCompanies } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminCompaniesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const companies = await getAdminCompanies(params.q ?? "");
  return <AdminCompanies companies={companies} />;
}
