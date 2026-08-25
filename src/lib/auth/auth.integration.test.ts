import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { applySetCookies, splitSetCookieHeader } from "better-auth/cookies";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "@/db/test-environment";

import { emailAndPasswordOptions, validateUserName } from "./options";

const baseUrl = "http://localhost:3000";
const pool = new Pool({ connectionString: getTestDatabaseUrl(process.env) });
const database = drizzle({ client: pool, schema });
const auth = betterAuth({
  baseURL: baseUrl,
  secret: "test-only-better-auth-secret-that-is-long-enough",
  database: drizzleAdapter(database, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: emailAndPasswordOptions,
  user: {
    validateUserInfo: ({ user, source }) => validateUserName(user, source),
  },
});

type AuthResponse = {
  code?: string;
  user?: {
    email: string;
    name: string;
  };
};

async function callAuth(
  path: string,
  options: Readonly<{
    body?: Record<string, unknown>;
    cookies?: Headers;
    method?: "GET" | "POST";
  }> = {},
): Promise<Response> {
  const headers = new Headers({ origin: baseUrl });

  if (options.cookies?.get("cookie")) {
    headers.set("cookie", options.cookies.get("cookie")!);
  }

  if (options.body) {
    headers.set("content-type", "application/json");
  }

  return auth.handler(
    new Request(`${baseUrl}/api/auth${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

function retainCookies(target: Headers, response: Response): void {
  const setCookie = response.headers.get("set-cookie");

  if (setCookie) {
    applySetCookies(target, splitSetCookieHeader(setCookie));
  }
}

async function signUp(email = "creator@example.com"): Promise<Headers> {
  const response = await callAuth("/sign-up/email", {
    body: {
      name: "Creator",
      email,
      password: "secure-password",
    },
  });
  const cookies = new Headers();

  retainCookies(cookies, response);
  expect(response.status).toBe(200);
  return cookies;
}

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  await database.execute('TRUNCATE TABLE "session", "account", "verification", "user" CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe("email/password authentication", () => {
  it("creates an account and an authenticated session on sign-up", async () => {
    const response = await callAuth("/sign-up/email", {
      body: {
        name: "Creator",
        email: "creator@example.com",
        password: "secure-password",
      },
    });
    const payload = (await response.json()) as AuthResponse;
    const cookies = new Headers();

    retainCookies(cookies, response);

    expect(response.status).toBe(200);
    expect(payload.user).toMatchObject({
      name: "Creator",
      email: "creator@example.com",
    });
    expect(cookies.get("cookie")).toContain("better-auth.session_token=");
  });

  it("rejects invalid sign-up inputs at the server boundary", async () => {
    const blankName = await callAuth("/sign-up/email", {
      body: {
        name: "   ",
        email: "creator@example.com",
        password: "secure-password",
      },
    });
    const blankNamePayload = (await blankName.json()) as AuthResponse;
    const shortPassword = await callAuth("/sign-up/email", {
      body: {
        name: "Creator",
        email: "creator@example.com",
        password: "short",
      },
    });
    const shortPasswordPayload = (await shortPassword.json()) as AuthResponse;

    expect(blankName.status).toBe(403);
    expect(blankNamePayload.code).toBe("INVALID_NAME");
    expect(shortPassword.status).toBe(400);
    expect(shortPasswordPayload.code).toBe("PASSWORD_TOO_SHORT");
  });

  it("creates a new session on successful sign-in", async () => {
    await signUp();
    const response = await callAuth("/sign-in/email", {
      body: {
        email: "creator@example.com",
        password: "secure-password",
      },
    });
    const payload = (await response.json()) as AuthResponse;
    const cookies = new Headers();

    retainCookies(cookies, response);

    expect(response.status).toBe(200);
    expect(payload.user?.email).toBe("creator@example.com");
    expect(cookies.get("cookie")).toContain("better-auth.session_token=");
  });

  it("returns the same safe failure for invalid sign-in credentials", async () => {
    const response = await callAuth("/sign-in/email", {
      body: {
        email: "missing@example.com",
        password: "secure-password",
      },
    });
    const payload = (await response.json()) as AuthResponse;

    expect(response.status).toBe(401);
    expect(payload.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("persists a session across subsequent server-side session checks", async () => {
    const cookies = await signUp();
    const firstSession = await callAuth("/get-session", { cookies });
    const secondSession = await callAuth("/get-session", { cookies });
    const firstPayload = (await firstSession.json()) as AuthResponse;
    const secondPayload = (await secondSession.json()) as AuthResponse;

    expect(firstSession.status).toBe(200);
    expect(firstPayload.user?.email).toBe("creator@example.com");
    expect(secondPayload.user?.email).toBe("creator@example.com");
  });

  it("terminates the persisted session on sign-out", async () => {
    const cookies = await signUp();
    const signOutResponse = await callAuth("/sign-out", {
      body: {},
      cookies,
    });
    const sessionResponse = await callAuth("/get-session", { cookies });
    const sessions = await pool.query("SELECT count(*)::int AS count FROM session");

    expect(signOutResponse.status).toBe(200);
    expect(await sessionResponse.json()).toBeNull();
    expect(sessions.rows[0]?.count).toBe(0);
  });
});
