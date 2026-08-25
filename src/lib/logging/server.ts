import "server-only";

import { createLogEntry, type LogContext, type LogLevel } from "./structured";

export type { LogContext };

function writeLog(level: LogLevel, event: string, context: LogContext = {}): void {
  const entry = createLogEntry(level, event, context);
  const output = JSON.stringify(entry);

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
