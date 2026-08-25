import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { getServerEnvironment } from "@/lib/env/server";

import { emailAndPasswordOptions, validateUserName } from "./options";

const environment = getServerEnvironment();

export const auth = betterAuth({
  baseURL: environment.BETTER_AUTH_URL,
  secret: environment.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: emailAndPasswordOptions,
  user: {
    validateUserInfo: ({ user, source }) => validateUserName(user, source),
  },
  plugins: [nextCookies()],
});

export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}
