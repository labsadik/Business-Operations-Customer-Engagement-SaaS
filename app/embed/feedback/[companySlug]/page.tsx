import { notFound } from "next/navigation";
import PublicFeedbackEmbed from "@/features/public-feedback/components/public-feedback-embed";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicFeedbackEmbedPage({
  params
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;
  await getMongo();
  const company = await Company.findOne({
    slug: companySlug.toLowerCase(),
    publicBookingEnabled: true
  }).select("name slug").lean();

  if (!company) notFound();
  return <PublicFeedbackEmbed companySlug={company.slug} companyName={company.name} />;
}
