import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/guards";
import { createPresignedDownloadLink } from "@/lib/downloadLinks";
import { getPresignedLink } from "@/lib/presignedLinks";

export const runtime = "nodejs";

const downloadRequestSchema = z.object({
  key: z.string().min(1),
  expiresInSeconds: z.number().int().min(60).max(604800),
});

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.response) {
      return auth.response;
    }

    const body = await request.json();
    const validation = downloadRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { key, expiresInSeconds } = validation.data;
    const link = await createPresignedDownloadLink(key, expiresInSeconds);

    return NextResponse.json({ link }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
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
    { link: await getPresignedLink(key) },
    { status: 200 },
  );
}
