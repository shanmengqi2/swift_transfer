import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/guards";
import { ensureSevenDayDownloadLink } from "@/lib/downloadLinks";
import {
  addPickupCodeFiles,
  getPickupCodeById,
  isPickupCodeRevoked,
  removePickupCodeFile,
  revokePickupCode,
  updatePickupCodeExpiration,
} from "@/lib/pickupCodes";

export const runtime = "nodejs";

const updatePickupCodeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update-expiration"),
    expiresAt: z.string().datetime().nullable(),
  }),
  z.object({
    action: z.literal("revoke"),
  }),
  z.object({
    action: z.literal("add-files"),
    files: z
      .array(
        z.object({
          key: z.string().min(1),
          bucket: z.string().min(1).optional(),
          fileName: z.string().min(1).optional(),
          size: z.number().int().nonnegative().optional(),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({
    action: z.literal("remove-file"),
    key: z.string().min(1),
  }),
]);

type PickupCodeRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  { params }: PickupCodeRouteContext,
) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.response) {
      return auth.response;
    }

    const { id } = await params;
    const pickupCode = await getPickupCodeById(id);

    if (!pickupCode) {
      return NextResponse.json(
        { error: "Pickup code not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ pickupCode }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load pickup code" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: PickupCodeRouteContext,
) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.response) {
      return auth.response;
    }

    const body = await request.json();
    const validation = updatePickupCodeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { id } = await params;
    const currentPickupCode = await getPickupCodeById(id);

    if (!currentPickupCode) {
      return NextResponse.json(
        { error: "Pickup code not found" },
        { status: 404 },
      );
    }

    if (
      validation.data.action !== "revoke" &&
      isPickupCodeRevoked(currentPickupCode.revokedAt)
    ) {
      return NextResponse.json(
        { error: "Revoked pickup codes cannot be modified" },
        { status: 409 },
      );
    }

    if (validation.data.action === "revoke") {
      await revokePickupCode(id);
    }

    if (validation.data.action === "update-expiration") {
      await updatePickupCodeExpiration({
        id,
        expiresAt: validation.data.expiresAt,
      });
    }

    if (validation.data.action === "add-files") {
      await Promise.all(
        validation.data.files.map((file) => ensureSevenDayDownloadLink(file.key)),
      );
      await addPickupCodeFiles({ id, files: validation.data.files });
    }

    if (validation.data.action === "remove-file") {
      await removePickupCodeFile({ id, key: validation.data.key });
    }

    return NextResponse.json(
      { pickupCode: await getPickupCodeById(id) },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to update pickup code" },
      { status: 500 },
    );
  }
}
