export type AuthErrorMessageKey =
  | "accountExists"
  | "generic"
  | "invalidCredentials"
  | "invalidEmail"
  | "invalidName"
  | "password";

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  const { code } = error;
  return typeof code === "string" ? code : undefined;
}

export function getAuthenticationErrorMessage(
  mode: "sign-in" | "sign-up",
  error: unknown,
): AuthErrorMessageKey {
  const code = getErrorCode(error);

  if (mode === "sign-in") {
    return code === "INVALID_EMAIL" ? "invalidEmail" : "invalidCredentials";
  }

  switch (code) {
    case "INVALID_NAME":
      return "invalidName";
    case "INVALID_EMAIL":
      return "invalidEmail";
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
    case "INVALID_PASSWORD":
      return "password";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "accountExists";
    default:
      return "generic";
  }
}
