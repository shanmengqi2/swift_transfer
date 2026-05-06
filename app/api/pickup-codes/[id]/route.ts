import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/guards";
import {
  getPickupCodeById,
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
    const pickupCode =
      validation.data.action === "revoke"
        ? await revokePickupCode(id)
        : await updatePickupCodeExpiration({
            id,
            expiresAt: validation.data.expiresAt,
          });

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
      { error: "Failed to update pickup code" },
      { status: 500 },
    );
  }
}
