import { NextResponse } from "next/server";
import { clearSession, getSession } from "@/lib/session";
import { markEmployeeNotAvailable } from "@/lib/employee-presence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.companyId && ["COMPANY_OWNER", "COMPANY_ADMIN", "EMPLOYEE"].includes(session.role)) {
    try {
      await markEmployeeNotAvailable(session.companyId, session.userId);
    } catch (error) {
      console.error("Conventus employee presence logout update failed", error);
    }
  }

  await clearSession();
  return NextResponse.redirect(new URL("/", request.url));
}
