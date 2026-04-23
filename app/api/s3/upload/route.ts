import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
  } catch {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
