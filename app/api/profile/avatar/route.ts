import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getMongo } from "@/lib/mongodb";
import { User } from "@/models/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 401 });

  await getMongo();
  const user = await User.findById(session.userId).select("image").lean();
  const imageUrl = user?.image;

  if (!imageUrl) return new NextResponse(null, { status: 404 });

  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (url.protocol !== "https:" || !url.hostname.endsWith("googleusercontent.com")) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const upstream = await fetch(url, {
      cache: "no-store",
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,*/*" }
    });

    if (!upstream.ok) return new NextResponse(null, { status: 404 });

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return new NextResponse(null, { status: 415 });

    return new NextResponse(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
