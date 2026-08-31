export const passwordPolicy = {
  minLength: 8,
  maxLength: 128,
} as const;

export const emailAndPasswordOptions = {
  enabled: true,
  minPasswordLength: passwordPolicy.minLength,
  maxPasswordLength: passwordPolicy.maxLength,
} as const;

type AuthInput = {
  name: string;
  email: string;
  password: string;
};

export type AuthFormField = keyof AuthInput;
export type AuthFormErrors = Partial<Record<AuthFormField, "name" | "email" | "password">>;

function hasValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export function validateAuthInput(mode: "sign-in" | "sign-up", input: AuthInput): AuthFormErrors {
  const errors: AuthFormErrors = {};

  if (mode === "sign-up" && input.name.trim().length === 0) {
    errors.name = "name";
  }

  if (!hasValidEmailFormat(input.email)) {
    errors.email = "email";
  }

  if (
    input.password.length < passwordPolicy.minLength ||
    input.password.length > passwordPolicy.maxLength
  ) {
    errors.password = "password";
  }

  return errors;
}

export function validateUserName(
  user: Readonly<{ name?: unknown }>,
  source: Readonly<{ action: string; method: string }>,
): { error: "INVALID_NAME" } | undefined {
  if (
    source.action === "create-user" &&
    source.method === "email-password" &&
    (typeof user.name !== "string" || user.name.trim().length === 0)
  ) {
    return { error: "INVALID_NAME" };
  }
}
