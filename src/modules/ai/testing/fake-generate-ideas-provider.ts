import "server-only";

import {
  createGenerateIdeasFailure,
  createGenerateIdeasSuccess,
  parseGenerateIdeasRequest,
  type GenerateIdeasProvider,
  type GenerateIdeasRequest,
  type GenerateIdeasResult,
} from "@/modules/ai/domain/generate-ideas";
import type { ProviderNeutralUsage } from "@/modules/ai/domain/ai-contracts";

export const fakeGenerateIdeasScenarios = [
  "success",
  "refusal",
  "incomplete",
  "malformed",
  "invalid-output",
  "timeout",
  "rate-limited",
  "provider-unavailable",
  "unknown",
] as const;

export type FakeGenerateIdeasScenario = (typeof fakeGenerateIdeasScenarios)[number];

export type FakeGenerateIdeasProviderOptions = Readonly<{
  scenario?: FakeGenerateIdeasScenario;
  /** Unknown is intentional: the fake exercises the same runtime boundary as a provider. */
  output?: unknown;
  usage?: ProviderNeutralUsage;
  /** Request snapshots can contain Content DNA, so recording is opt-in. */
  recordRequests?: boolean;
  /** Test-only instrumentation; never records the request payload itself. */
  onInvocation?: (request: GenerateIdeasRequest) => void;
}>;

const failureByScenario: Record<
  Exclude<FakeGenerateIdeasScenario, "success">,
  Parameters<typeof createGenerateIdeasFailure>[0]
> = {
  refusal: "INVALID_OUTPUT",
  incomplete: "INVALID_OUTPUT",
  malformed: "INVALID_OUTPUT",
  "invalid-output": "INVALID_OUTPUT",
  timeout: "TIMEOUT",
  "rate-limited": "RATE_LIMITED",
  "provider-unavailable": "PROVIDER_UNAVAILABLE",
  unknown: "UNKNOWN",
};

function createDefaultOutput(language: GenerateIdeasRequest["requestedLanguage"]): unknown {
  const prefix = language === "fa" ? "ایده آزمایشی" : "Deterministic idea";
  const description =
    language === "fa"
      ? "توضیح قطعی برای آزمون قرارداد تولید ایده."
      : "Deterministic description for contract tests.";

  return {
    schemaVersion: 1,
    ideas: Array.from({ length: 20 }, (_, index) => ({
      title: `${prefix} ${index + 1}`,
      description: `${description} ${index + 1}`,
      category: "Deterministic test",
    })),
  };
}

/**
 * A small, synchronous-in-behavior fake for CI. It has no network, database,
 * credential, SDK, lifecycle, quota, or authorization behavior.
 */
export class FakeGenerateIdeasProvider implements GenerateIdeasProvider {
  private readonly scenario: FakeGenerateIdeasScenario;
  private readonly customOutput: unknown;
  private readonly usage: ProviderNeutralUsage | undefined;
  private readonly shouldRecordRequests: boolean;
  private readonly onInvocation: ((request: GenerateIdeasRequest) => void) | undefined;
  private readonly recordedRequests: GenerateIdeasRequest[] = [];
  private calls = 0;

  constructor(options: FakeGenerateIdeasProviderOptions = {}) {
    this.scenario = options.scenario ?? "success";
    this.customOutput = options.output;
    this.usage = options.usage;
    this.shouldRecordRequests = options.recordRequests ?? false;
    this.onInvocation = options.onInvocation;
  }

  get invocationCount(): number {
    return this.calls;
  }

  get requests(): readonly GenerateIdeasRequest[] {
    return this.recordedRequests.slice();
  }

  get lastRequest(): GenerateIdeasRequest | undefined {
    return this.recordedRequests.at(-1);
  }

  async generateIdeas(request: GenerateIdeasRequest): Promise<GenerateIdeasResult> {
    const canonicalRequest = parseGenerateIdeasRequest(request);
    this.calls += 1;

    if (this.shouldRecordRequests) {
      this.recordedRequests.push(canonicalRequest);
    }
    this.onInvocation?.(canonicalRequest);

    if (this.scenario !== "success") {
      return createGenerateIdeasFailure(failureByScenario[this.scenario]);
    }

    const output = this.customOutput ?? createDefaultOutput(canonicalRequest.requestedLanguage);

    return createGenerateIdeasSuccess(output, this.usage);
  }
}

export const DeterministicFakeGenerateIdeasProvider = FakeGenerateIdeasProvider;

export function createFakeGenerateIdeasProvider(
  options: FakeGenerateIdeasProviderOptions = {},
): FakeGenerateIdeasProvider {
  return new FakeGenerateIdeasProvider(options);
}
