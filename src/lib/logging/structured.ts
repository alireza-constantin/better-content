import type { ApplicationErrorCode } from "@/lib/errors/app-error";

const logContextKeys = ["requestId", "userId", "workspaceId", "module", "operation", "errorCode"] as const;

export type LogContext = Readonly<{
  requestId?: string;
  userId?: string;
  workspaceId?: string;
  module?: string;
  operation?: string;
  errorCode?: ApplicationErrorCode;
}>;

export type LogLevel = "error" | "info" | "warn";

export type LogEntry = LogContext & {
  level: LogLevel;
  event: string;
};

export function createLogEntry(level: LogLevel, event: string, context: unknown = {}): LogEntry {
  const safeContext: Record<string, string> = {};

  if (context && typeof context === "object") {
    const untrustedContext = context as Record<string, unknown>;

    for (const key of logContextKeys) {
      const value = untrustedContext[key];

      if (typeof value === "string") {
        safeContext[key] = value;
      }
    }
  }

  return { level, event, ...safeContext } as LogEntry;
}
