import { jsonError, jsonOk } from "@/lib/http";
import { listPublicPlans, serializePublicPlan } from "@/lib/plan-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plans = await listPublicPlans();
    return jsonOk({ items: plans.map(serializePublicPlan) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PUBLIC_PLANS_UNAVAILABLE";
    return jsonError(code, 503);
  }
}
