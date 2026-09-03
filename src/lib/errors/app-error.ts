export const applicationErrorCodes = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "AI_OUTPUT_INVALID",
  "INTERNAL_ERROR",
] as const;

export type ApplicationErrorCode = (typeof applicationErrorCodes)[number];

export const rateLimitSources = ["workspace", "provider"] as const;
export type RateLimitSource = (typeof rateLimitSources)[number];

export type ApplicationErrorOptions = Readonly<{
  rateLimitSource?: RateLimitSource;
}>;

const statusByCode: Record<ApplicationErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  AI_OUTPUT_INVALID: 502,
  INTERNAL_ERROR: 500,
};

export class ApplicationError extends Error {
  readonly status: number;
  readonly rateLimitSource: RateLimitSource | undefined;

  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    options: ApplicationErrorOptions = {},
  ) {
    super(message);
    this.name = "ApplicationError";
    this.status = statusByCode[code];
    this.rateLimitSource = options.rateLimitSource;
  }
}
