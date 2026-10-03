import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { getSession, ADMIN_MANAGED_COMPANY_COOKIE } from "@/lib/session";
import { Company } from "@/models/company";
import { Workspace } from "@/models/workspace";
import { assertSameOrigin } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    if (!session) return jsonError("UNAUTHENTICATED", 401);
    if (session.role !== "PLATFORM_ADMIN") return jsonError("FORBIDDEN", 403);

    const { companyId } = await params;
    if (!Types.ObjectId.isValid(companyId)) return jsonError("INVALID_COMPANY_ID", 400);

    await getMongo();
    const company = await Company.findById(companyId).select("_id name").lean();
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const workspace = await Workspace.findOne({ companyId: company._id })
      .select("_id")
      .sort({ createdAt: 1 })
      .lean();
    if (!workspace) return jsonError("WORKSPACE_NOT_FOUND", 404);

    const store = await cookies();
    store.set(ADMIN_MANAGED_COMPANY_COOKIE, String(company._id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 60
    });

    return jsonOk({
      companyId: String(company._id),
      workspaceId: String(workspace._id),
      companyName: company.name
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_COMPANY_MANAGE_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" || code === "FORBIDDEN" ? 403 :
      code === "UNAUTHENTICATED" ? 401 :
      code === "COMPANY_NOT_FOUND" || code === "WORKSPACE_NOT_FOUND" ? 404 : 500;
    return jsonError(code, status);
  }
}
