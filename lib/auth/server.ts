import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export async function getCurrentSession() {
  const cookieStore = await cookies();

  return verifySessionToken(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}
