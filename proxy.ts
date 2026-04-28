import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";

function isProtectedPage(pathname: string) {
  return pathname === "/" || pathname === "/files" || pathname.startsWith("/files/");
}

function isProtectedApi(pathname: string) {
  return pathname.startsWith("/api/s3/");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await getSessionFromRequest(request);

  if (!session && isProtectedPage(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  if (!session && isProtectedApi(pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/files", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/files/:path*", "/login", "/api/s3/:path*"],
};
