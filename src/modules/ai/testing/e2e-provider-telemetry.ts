import "server-only";

import type { GenerateIdeasRequest } from "@/modules/ai/domain/generate-ideas";

const telemetryKey = Symbol.for("better-content.e2e-provider-telemetry");

type E2eProviderTelemetry = {
  invocationCount: number;
  lastRequestedLanguage: GenerateIdeasRequest["requestedLanguage"] | null;
  lastRequestedCount: GenerateIdeasRequest["requestedCount"] | null;
};

type GlobalWithE2eProviderTelemetry = typeof globalThis & {
  [telemetryKey]?: E2eProviderTelemetry;
};

function getTelemetry(): E2eProviderTelemetry {
  const globalWithTelemetry = globalThis as GlobalWithE2eProviderTelemetry;

  if (!globalWithTelemetry[telemetryKey]) {
    globalWithTelemetry[telemetryKey] = {
      invocationCount: 0,
      lastRequestedLanguage: null,
      lastRequestedCount: null,
    };
  }

  return globalWithTelemetry[telemetryKey];
}

export function recordE2eProviderInvocation(request: GenerateIdeasRequest): void {
  const telemetry = getTelemetry();
  telemetry.invocationCount += 1;
  telemetry.lastRequestedLanguage = request.requestedLanguage;
  telemetry.lastRequestedCount = request.requestedCount;
}

export function readE2eProviderTelemetry(): E2eProviderTelemetry {
  return { ...getTelemetry() };
}
