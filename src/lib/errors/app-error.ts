export const applicationErrorCodes = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ApplicationErrorCode = (typeof applicationErrorCodes)[number];

const statusByCode: Record<ApplicationErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class ApplicationError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
    this.status = statusByCode[code];
  }
}
