import { verifyPassword } from "@/lib/auth/password";

type AuthUser = {
  username: string;
  passwordHash: string;
};

function parseDelimitedUsers(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");

      if (separatorIndex <= 0) {
        return null;
      }

      return {
        username: entry.slice(0, separatorIndex),
        passwordHash: entry.slice(separatorIndex + 1),
      };
    })
    .filter((user): user is AuthUser => Boolean(user));
}

function parseJsonUsers(value: string) {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((user): user is AuthUser => {
    return (
      typeof user === "object" &&
      user !== null &&
      "username" in user &&
      "passwordHash" in user &&
      typeof user.username === "string" &&
      typeof user.passwordHash === "string"
    );
  });
}

function getAuthUsers() {
  const value = process.env.AUTH_USERS;

  if (!value) {
    return [];
  }

  try {
    return value.trim().startsWith("[")
      ? parseJsonUsers(value)
      : parseDelimitedUsers(value);
  } catch {
    return [];
  }
}

export async function authenticateUser(username: string, password: string) {
  const user = getAuthUsers().find((authUser) => authUser.username === username);

  if (!user) {
    return null;
  }

  const authenticated = verifyPassword(password, user.passwordHash);

  return authenticated ? { username: user.username } : null;
}
