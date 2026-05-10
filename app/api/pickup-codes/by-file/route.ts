import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/guards";
import { listPickupCodesForFile } from "@/lib/pickupCodes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.response) {
      return auth.response;
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    return NextResponse.json(
      { pickupCodes: await listPickupCodesForFile(key) },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to list pickup codes" },
      { status: 500 },
    );
  }
}
