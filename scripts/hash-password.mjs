import { randomBytes, scryptSync } from "crypto";

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error("Usage: pnpm auth:hash <username> <password>");
  process.exit(1);
}

const salt = randomBytes(16).toString("base64url");
const key = scryptSync(password, salt, 64).toString("base64url");
const hash = `scrypt:v1:${salt}:${key}`;

console.log(`${username}:${hash}`);
