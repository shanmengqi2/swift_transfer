export const AUTH_COOKIE_NAME = "swift_transfer_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type AuthSession = {
  username: string;
  expiresAt: Date;
};

type SessionPayload = {
  sub: string;
  iat: number;
  exp: number;
};

const textEncoder = new TextEncoder();

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters long.");
  }

  return secret;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const paddedValue = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(paddedValue.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodePayload(payload: SessionPayload) {
  return encodeBase64Url(textEncoder.encode(JSON.stringify(payload)));
}

function decodePayload(value: string): SessionPayload | null {
  try {
    const json = new TextDecoder().decode(decodeBase64Url(value));
    const payload = JSON.parse(json) as Partial<SessionPayload>;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: string) {
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(value),
  );

  return encodeBase64Url(new Uint8Array(signature));
}

function timingSafeStringEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let result = left.length === right.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    result |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return result === 0;
}

export async function createSessionToken(username: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encodePayload({
    sub: username,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  });
  const signature = await sign(payload);

  return `${payload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) {
    return null;
  }

  const [payloadPart, signaturePart] = tokenParts;
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = await sign(payloadPart);
  if (!timingSafeStringEqual(signaturePart, expectedSignature)) {
    return null;
  }

  const payload = decodePayload(payloadPart);
  if (!payload || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    username: payload.sub,
    expiresAt: new Date(payload.exp * 1000),
  } satisfies AuthSession;
}

export function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function getSessionFromRequest(request: Request) {
  return verifySessionToken(
    getCookieValue(request.headers.get("cookie"), AUTH_COOKIE_NAME),
  );
}
