import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const HASH_PREFIX = "scrypt";
const HASH_VERSION = "v1";
const KEY_LENGTH = 64;

export function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, KEY_LENGTH).toString("base64url");

  return `${HASH_PREFIX}:${HASH_VERSION}:${salt}:${key}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [prefix, version, salt, expectedKey] = passwordHash.split(":");

  if (
    prefix !== HASH_PREFIX ||
    version !== HASH_VERSION ||
    !salt ||
    !expectedKey
  ) {
    return false;
  }

  const actualKey = scryptSync(password, salt, KEY_LENGTH);
  const expectedKeyBuffer = Buffer.from(expectedKey, "base64url");

  if (actualKey.length !== expectedKeyBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualKey, expectedKeyBuffer);
}
