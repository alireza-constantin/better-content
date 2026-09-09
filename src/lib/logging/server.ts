import "server-only";

import { createLogEntry, type LogContext, type LogEntry, type LogLevel } from "./structured";

export type { LogContext };

function formatDevelopmentLog(entry: LogEntry): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
  const fields = [
    "operation",
    "stage",
    "errorCode",
    "errorName",
    "safeErrorMessage",
    "workspaceId",
    "entityId",
    "aiRunId",
  ] as const;
  const renderedFields = fields.flatMap((field) => {
    const value = entry[field];
    return value === undefined
      ? []
      : [`${field === "safeErrorMessage" ? "error" : field}=${JSON.stringify(value)}`];
  });

  return [time, entry.level.toUpperCase(), entry.event, ...renderedFields].join(" ");
}

function writeLog(level: LogLevel, event: string, context: LogContext = {}): void {
  const entry = createLogEntry(level, event, context);
  const output =
    process.env.NODE_ENV === "production" ? JSON.stringify(entry) : formatDevelopmentLog(entry);

  if (level === "error") {
    console.error(output);
    return;
  }

  if (level === "warn") {
    console.warn(output);
    return;
  }

  console.info(output);
}

export const logger = {
  error(event: string, context?: LogContext) {
    writeLog("error", event, context);
  },
  info(event: string, context?: LogContext) {
    writeLog("info", event, context);
  },
  warn(event: string, context?: LogContext) {
    writeLog("warn", event, context);
  },
};
