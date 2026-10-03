import { notFound } from "next/navigation";
import AdminCompanyDetailsView from "@/components/admin-company-details";
import { getAdminCompanyDetails } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminCompanyDetailsPage({
  params
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const company = await getAdminCompanyDetails(companyId);
  if (!company) notFound();
  return <AdminCompanyDetailsView company={company} />;
}
