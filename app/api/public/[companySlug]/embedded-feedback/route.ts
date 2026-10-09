import { Types } from "mongoose";
import { getMongo } from "@/lib/mongodb";
import { Company } from "@/models/company";
import { Feedback } from "@/models/feedback";
import { withRedisLock } from "@/lib/redis-lock";
import { assertSameOrigin, sha256 } from "@/lib/security";
import { jsonError, jsonOk } from "@/lib/http";
import { validatePublicEmbeddedFeedback } from "@/features/public-feedback/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IP_COOLDOWN_MS = 60 * 1000;
const EMAIL_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 8 * 1024;

async function findPublicCompany(companySlug: string) {
  await getMongo();
  return Company.findOne({
    slug: companySlug.toLowerCase(),
    publicBookingEnabled: true
  }).select("_id name slug").lean();
}

function requestFingerprint(request: Request) {
  // Hash the forwarded address so raw IP addresses are not stored in the feedback document.
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "";
  const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(0, 300);
  return sha256("public-embedded-feedback:v1:" + (forwarded || "local") + ":" + userAgent);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  try {
    const { companySlug } = await params;
    const company = await findPublicCompany(companySlug);
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const reviews = await Feedback.find({
      source: "PUBLIC_EMBED",
      companyId: company._id,
      reviewStatus: "REVIEWED"
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .select("_id submitterName rating description createdAt")
      .lean();

    return jsonOk({
      company: { name: company.name, slug: company.slug },
      reviews: reviews.map((item) => ({
        id: String(item._id),
        name: item.submitterName || "Customer",
        rating: item.rating,
        description: item.description,
        createdAt: item.createdAt
      }))
    });
  } catch {
    return jsonError("PUBLIC_FEEDBACK_LOAD_FAILED", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  try {
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return jsonError("FEEDBACK_BODY_TOO_LARGE", 413);
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return jsonError("FEEDBACK_INPUT_INVALID", 400);

    // Quietly accept the honeypot to avoid teaching bots how to bypass it.
    if (typeof body.website === "string" && body.website.trim()) {
      return jsonOk({ accepted: true }, 201);
    }

    const { companySlug } = await params;
    const company = await findPublicCompany(companySlug);
    if (!company) return jsonError("COMPANY_NOT_FOUND", 404);

    const input = validatePublicEmbeddedFeedback(body);
    const ipHash = requestFingerprint(request);

    const created = await withRedisLock(
      "feedback:public-embed:" + String(company._id) + ":" + ipHash,
      10_000,
      async () => {
        const now = Date.now();
        const recentIpSubmission = await Feedback.findOne({
          source: "PUBLIC_EMBED",
          companyId: company._id,
          submitterIpHash: ipHash,
          createdAt: { $gte: new Date(now - IP_COOLDOWN_MS) }
        }).select("_id").lean();
        if (recentIpSubmission) throw new Error("FEEDBACK_RATE_LIMITED");

        const recentEmailSubmission = await Feedback.findOne({
          source: "PUBLIC_EMBED",
          companyId: company._id,
          submitterEmail: input.email,
          createdAt: { $gte: new Date(now - EMAIL_COOLDOWN_MS) }
        }).select("_id").lean();
        if (recentEmailSubmission) throw new Error("FEEDBACK_EMAIL_COOLDOWN");

        return Feedback.create({
          source: "PUBLIC_EMBED",
          companyId: new Types.ObjectId(String(company._id)),
          submitterName: input.name,
          submitterEmail: input.email,
          submitterPhone: input.phone,
          submitterIpHash: ipHash,
          rating: input.rating,
          description: input.description,
          reviewStatus: "NEW"
        });
      }
    );

    return jsonOk({ id: String(created._id), accepted: true }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PUBLIC_FEEDBACK_SUBMISSION_FAILED";
    const status =
      code === "CSRF_ORIGIN_INVALID" ? 403 :
      code === "COMPANY_NOT_FOUND" ? 404 :
      code === "FEEDBACK_RATE_LIMITED" || code === "FEEDBACK_EMAIL_COOLDOWN" || code === "RESOURCE_BUSY" ? 429 :
      code === "FEEDBACK_BODY_TOO_LARGE" ? 413 :
      code.includes("_INVALID") || code.includes("_REQUIRED") || code.includes("_TOO_LONG") || code.includes("_TOO_SHORT") ? 400 : 500;
    return jsonError(code, status);
  }
}
