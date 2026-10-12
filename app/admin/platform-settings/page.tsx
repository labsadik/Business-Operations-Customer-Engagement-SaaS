import AdminPlatformSettings from "@/components/admin-platform-settings";
import { getPlatformSettings } from "@/lib/platform";
import { normalizeNavigationLabels } from "@/lib/navigation-labels";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform Settings · Canvas" };

export default async function AdminPlatformSettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "PLATFORM_ADMIN") return null;

  const settings = await getPlatformSettings();

  return (
    <AdminPlatformSettings
      initial={{
        legalName: settings.legalName,
        description: settings.description,
        websiteUrl: settings.websiteUrl,
        billingEmail: settings.billingEmail,
        phone: settings.phone,
        logoUrl: settings.logoUrl,
        taxId: settings.taxId,
        gstin: settings.gstin,
        sacCode: settings.sacCode,
        address: settings.address,
        gst: settings.gst,
        navigation: normalizeNavigationLabels(settings.navigation)
      }}
    />
  );
}
