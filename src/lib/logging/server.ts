import "server-only";

import { createLogEntry, type LogContext, type LogEntry, type LogLevel } from "./structured";

export type { LogContext };

const ansi = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
  cyan: "\u001b[36m",
  white: "\u001b[37m",
} as const;

function colorize(value: string, color: string): string {
  return `${color}${value}${ansi.reset}`;
}

export function formatDevelopmentLog(entry: LogEntry, now = new Date()): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const fields = [
    "operation",
    "stage",
    "errorCode",
    "errorCategory",
    "errorName",
    "safeErrorMessage",
    "httpStatus",
    "providerErrorName",
    "providerRequestCorrelation",
    "workspaceId",
    "entityId",
    "aiRunId",
  ] as const;
  const renderedFields = fields.flatMap((field) => {
    const value = entry[field];
    return value === undefined
      ? []
      : [
          `  ${colorize(field === "safeErrorMessage" ? "error" : field, ansi.cyan)}: ${String(value)}`,
        ];
  });

  const levelColor =
    entry.level === "error" ? ansi.red : entry.level === "warn" ? ansi.yellow : ansi.green;
  const title = `${colorize(time, ansi.dim)} ${colorize(entry.level.toUpperCase(), `${ansi.bold}${levelColor}`)} ${colorize(entry.event, `${ansi.bold}${ansi.white}`)}`;
  const divider = colorize("────────────────────────────────────────────────────────", ansi.dim);

  return [divider, title, ...renderedFields, divider].join("\n");
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
