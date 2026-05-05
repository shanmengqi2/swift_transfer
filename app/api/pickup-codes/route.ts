import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/guards";
import { ensureSevenDayDownloadLink } from "@/lib/downloadLinks";
import { createPickupCode } from "@/lib/pickupCodes";

export const runtime = "nodejs";

const pickupFileSchema = z.object({
  key: z.string().min(1),
  bucket: z.string().min(1).optional(),
  fileName: z.string().min(1).optional(),
  size: z.number().int().nonnegative().optional(),
});

const createPickupCodeSchema = z.object({
  files: z.array(pickupFileSchema).min(1).max(100),
  expiresInMinutes: z.number().int().min(1).max(5256000).nullable(),
});

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.response) {
      return auth.response;
    }

    const body = await request.json();
    const validation = createPickupCodeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { files, expiresInMinutes } = validation.data;
    await Promise.all(files.map((file) => ensureSevenDayDownloadLink(file.key)));

    const createdAt = Date.now();
    const pickupCode = await createPickupCode({
      files,
      expiresAt:
        expiresInMinutes === null
          ? null
          : new Date(createdAt + expiresInMinutes * 60 * 1000).toISOString(),
    });

    return NextResponse.json({ pickupCode }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create pickup code" },
      { status: 500 },
    );
  }
}
