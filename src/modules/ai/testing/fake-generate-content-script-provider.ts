import "server-only";

import type {
  ProviderNeutralUsage,
  SafeProviderRequestCorrelation,
} from "@/modules/ai/domain/ai-contracts";
import {
  createGenerateContentScriptFailure,
  createGenerateContentScriptSuccess,
  parseGenerateContentScriptRequest,
  type GenerateContentScriptProvider,
  type GenerateContentScriptRequest,
  type GenerateContentScriptResult,
} from "@/modules/ai/domain/generate-content-script";

export const fakeGenerateContentScriptScenarios = [
  "success",
  "refusal",
  "incomplete",
  "malformed",
  "invalid-output",
  "timeout",
  "rate-limited",
  "provider-unavailable",
  "interrupted",
  "unknown",
] as const;

export type FakeGenerateContentScriptScenario = (typeof fakeGenerateContentScriptScenarios)[number];

export type FakeGenerateContentScriptProviderOptions = Readonly<{
  scenario?: FakeGenerateContentScriptScenario;
  /** Unknown deliberately exercises the provider result-validation boundary. */
  output?: unknown;
  usage?: ProviderNeutralUsage;
  providerRequestCorrelation?: SafeProviderRequestCorrelation;
  /** Request snapshots can contain creator data, so test recording is opt-in. */
  recordRequests?: boolean;
  /** Test-only instrumentation; this fake never logs the request itself. */
  onInvocation?: (request: GenerateContentScriptRequest) => void;
}>;

const failureByScenario: Record<
  Exclude<FakeGenerateContentScriptScenario, "success">,
  Parameters<typeof createGenerateContentScriptFailure>[0]
> = {
  refusal: "INVALID_OUTPUT",
  incomplete: "INVALID_OUTPUT",
  malformed: "INVALID_OUTPUT",
  "invalid-output": "INVALID_OUTPUT",
  timeout: "TIMEOUT",
  "rate-limited": "RATE_LIMITED",
  "provider-unavailable": "PROVIDER_UNAVAILABLE",
  interrupted: "INTERRUPTED",
  unknown: "UNKNOWN",
};

function createDefaultOutput(request: GenerateContentScriptRequest): unknown {
  const textByLanguageAndFormat = {
    en: {
      SHORT_VIDEO: "Deterministic English short-video script.",
      LONG_VIDEO: "Deterministic English long-video script.",
    },
    fa: {
      SHORT_VIDEO: "متن قطعی ویدیوی کوتاه فارسی.",
      LONG_VIDEO: "متن قطعی ویدیوی بلند فارسی.",
    },
  } as const;

  return {
    schemaVersion: 1,
    script: { text: textByLanguageAndFormat[request.requestedLanguage][request.format] },
  };
}

/** A test-only deterministic provider with no network, persistence, or policy behavior. */
export class FakeGenerateContentScriptProvider implements GenerateContentScriptProvider {
  private readonly scenario: FakeGenerateContentScriptScenario;
  private readonly customOutput: unknown;
  private readonly usage: ProviderNeutralUsage | undefined;
  private readonly providerRequestCorrelation: SafeProviderRequestCorrelation | undefined;
  private readonly shouldRecordRequests: boolean;
  private readonly onInvocation: ((request: GenerateContentScriptRequest) => void) | undefined;
  private readonly recordedRequests: GenerateContentScriptRequest[] = [];
  private calls = 0;

  constructor(options: FakeGenerateContentScriptProviderOptions = {}) {
    this.scenario = options.scenario ?? "success";
    this.customOutput = options.output;
    this.usage = options.usage;
    this.providerRequestCorrelation = options.providerRequestCorrelation;
    this.shouldRecordRequests = options.recordRequests ?? false;
    this.onInvocation = options.onInvocation;
  }

  get invocationCount(): number {
    return this.calls;
  }

  get requests(): readonly GenerateContentScriptRequest[] {
    return this.recordedRequests.slice();
  }

  get lastRequest(): GenerateContentScriptRequest | undefined {
    return this.recordedRequests.at(-1);
  }

  async generateContentScript(
    request: GenerateContentScriptRequest,
  ): Promise<GenerateContentScriptResult> {
    const canonicalRequest = parseGenerateContentScriptRequest(request);
    this.calls += 1;

    if (this.shouldRecordRequests) {
      this.recordedRequests.push(canonicalRequest);
    }
    this.onInvocation?.(canonicalRequest);

    if (this.scenario !== "success") {
      return createGenerateContentScriptFailure(failureByScenario[this.scenario]);
    }

    return createGenerateContentScriptSuccess(
      this.customOutput ?? createDefaultOutput(canonicalRequest),
      this.usage,
      this.providerRequestCorrelation,
    );
  }
}

export const DeterministicFakeGenerateContentScriptProvider = FakeGenerateContentScriptProvider;

export function createFakeGenerateContentScriptProvider(
  options: FakeGenerateContentScriptProviderOptions = {},
): FakeGenerateContentScriptProvider {
  return new FakeGenerateContentScriptProvider(options);
}
