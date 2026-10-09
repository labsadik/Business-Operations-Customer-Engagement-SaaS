import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import CompanyProfile from "@/components/company-profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company Profile · Conventus" };

export default async function CompanyProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login?error=signin_required");

  if (session.role !== "COMPANY_ADMIN" || !session.companyId) {
    redirect("/dashboard");
  }

  return (
    <CompanyProfile
      user={{ name: session.name, email: session.email, image: session.image }}
      currentRole={session.role}
    />
  );
}
