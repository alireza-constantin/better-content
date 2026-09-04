import "server-only";

import type { GenerateContentScriptRequest } from "@/modules/ai/domain/generate-content-script";

const telemetryKey = Symbol.for("better-content.e2e-content-provider-telemetry");

type E2eContentProviderTelemetry = {
  invocationCount: number;
  lastRequestedLanguage: GenerateContentScriptRequest["requestedLanguage"] | null;
  lastRequestedFormat: GenerateContentScriptRequest["format"] | null;
};

type GlobalWithE2eContentProviderTelemetry = typeof globalThis & {
  [telemetryKey]?: E2eContentProviderTelemetry;
};

function getTelemetry(): E2eContentProviderTelemetry {
  const globalWithTelemetry = globalThis as GlobalWithE2eContentProviderTelemetry;

  if (!globalWithTelemetry[telemetryKey]) {
    globalWithTelemetry[telemetryKey] = {
      invocationCount: 0,
      lastRequestedLanguage: null,
      lastRequestedFormat: null,
    };
  }

  return globalWithTelemetry[telemetryKey];
}

export function recordE2eContentProviderInvocation(request: GenerateContentScriptRequest): void {
  const telemetry = getTelemetry();
  telemetry.invocationCount += 1;
  telemetry.lastRequestedLanguage = request.requestedLanguage;
  telemetry.lastRequestedFormat = request.format;
}

export function readE2eContentProviderTelemetry(): E2eContentProviderTelemetry {
  return { ...getTelemetry() };
}
