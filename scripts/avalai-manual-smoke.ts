import {
  AVALAI_API_BASE_URL,
  AVALAI_MODEL,
  createAvalAIResponsesClient,
  createAvalAIGenerateIdeasProvider,
  type AvalAITransportResponse,
} from "@/modules/ai/infrastructure/avalai";
import { parseAvalAIEnvironment, type AvalAIEnvironment } from "@/lib/env/schema";
import type { ContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";

const VERIFY_IMPORT_FLAG = "--verify-import";
const userId = "phase-3-avalai-manual-smoke-user";
const requestOptions = { timeout: 60_000, maxRetries: 0 } as const;

const contentDna: ContentDnaPayload = {
  schemaVersion: 1,
  identity: { creatorOrBrandDescription: "A fictional educator who explains practical skills." },
  audience: { targetAudienceDescription: "New creators learning clear short-form education." },
  expertise: { primaryTopics: ["Practical education", "Creative habits"] },
  voice: { toneTraits: ["Warm", "Clear"] },
  goals: { contentGoals: ["Teach useful concepts"] },
  preferences: {
    preferredFormats: ["Short educational video"],
    topicsToAvoid: ["Politics"],
    approachesToAvoid: ["Clickbait"],
    additionalInstructions: "Use concrete, safe examples.",
  },
  language: { defaultContentLanguage: "en", contentLanguages: ["en", "fa"] },
};

const generationRequest = (requestedLanguage: "en" | "fa") => ({
  generationKind: "IDEA_GENERATION" as const,
  contentDna,
  requestedLanguage,
  requestedCount: 20 as const,
  promptVersion: "idea-generation/v1" as const,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTransportResponse(value: unknown): value is AvalAITransportResponse {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "data");
}

function requestIdOf(value: unknown): string | undefined {
  return isTransportResponse(value) && typeof value.providerRequestId === "string"
    ? value.providerRequestId
    : undefined;
}

function responseBodyOf(value: unknown): unknown {
  return isTransportResponse(value) ? value.data : value;
}

async function runMinimalRequest(
  client: ReturnType<typeof createAvalAIResponsesClient>,
  language: "en" | "fa",
) {
  const input =
    language === "en" ? "Reply with the single word OK." : "فقط با یک کلمه OK پاسخ بده.";
  try {
    const transportResponse = await client.responses.create(
      { model: AVALAI_MODEL, input, max_output_tokens: 32 },
      requestOptions,
    );
    const body = responseBodyOf(transportResponse);

    return {
      check: `minimal-${language}`,
      completed: isRecord(body) && body.status === "completed",
      requestId: requestIdOf(transportResponse) ?? "unavailable",
      errorCategory: null,
    };
  } catch {
    return {
      check: `minimal-${language}`,
      completed: false,
      requestId: "unavailable",
      errorCategory: "PROVIDER_ERROR",
    } as const;
  }
}

async function runIdeaGeneration(language: "en" | "fa", environment: AvalAIEnvironment) {
  let providerRequestId: string | undefined;
  const provider = createAvalAIGenerateIdeasProvider({
    userId,
    environment,
    onProviderRequestId: (requestId) => {
      providerRequestId = requestId;
    },
  });
  const result = await provider.generateIdeas(generationRequest(language));

  return {
    check: `idea-generation-${language}`,
    ok: result.ok,
    ideaCount: result.ok ? result.output.ideas.length : 0,
    requestId: providerRequestId ?? "unavailable",
    usage: result.ok ? (result.usage ?? null) : null,
    errorCategory: result.ok ? null : result.errorCategory,
  };
}

function hasUnavailableRequestId(results: Array<{ requestId: string }>): boolean {
  return results.some((result) => result.requestId === "unavailable");
}

async function lookupTransactions(requestIds: string[], apiKey: string) {
  const delaySeconds = Math.min(
    Math.max(Number.parseInt(process.env.AVALAI_SMOKE_LOOKUP_DELAY_SECONDS ?? "30", 10), 0),
    60,
  );

  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1_000));

  const response = await fetch("https://api.avalai.ir/user/v1/transactions/lookup", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transaction_ids: requestIds }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status } as const;
  }

  const data: unknown = await response.json();

  if (!isRecord(data) || !Array.isArray(data.transactions)) {
    return { ok: false, status: "invalid-response" } as const;
  }

  return {
    ok: true,
    transactions: data.transactions.flatMap((transaction) => {
      if (!isRecord(transaction)) {
        return [];
      }

      const tokens = isRecord(transaction.tokens) ? transaction.tokens : undefined;
      const cost = isRecord(transaction.cost) ? transaction.cost : undefined;
      const billingSource =
        typeof transaction.billing_source === "string"
          ? transaction.billing_source
          : typeof cost?.billing_source === "string"
            ? cost.billing_source
            : undefined;

      return [
        {
          model: typeof transaction.model === "string" ? transaction.model : "unavailable",
          inputTokens: tokens?.prompt ?? null,
          cachedTokens: tokens?.cached ?? null,
          outputTokens: tokens?.completion ?? null,
          totalTokens: tokens?.total ?? null,
          billedCost: cost
            ? {
                unit: cost.unit ?? null,
                paidUnit: cost.paid_unit ?? null,
                paidIrt: cost.paid_irt ?? null,
              }
            : null,
          billingSource: billingSource ?? "unavailable",
        },
      ];
    }),
  } as const;
}

async function runManualSmoke() {
  const environment = parseAvalAIEnvironment(process.env);
  const client = createAvalAIResponsesClient(environment);
  const results = [
    await runMinimalRequest(client, "en"),
    await runMinimalRequest(client, "fa"),
    await runIdeaGeneration("en", environment),
    await runIdeaGeneration("fa", environment),
  ];

  console.info(
    JSON.stringify({
      endpoint: AVALAI_API_BASE_URL,
      model: AVALAI_MODEL,
      results,
    }),
  );

  if (hasUnavailableRequestId(results)) {
    throw new Error("AvalAI did not expose the canonical avalai-request-id header.");
  }

  if (process.env.AVALAI_SMOKE_LOOKUP === "1") {
    const requestIds = results.map((result) => result.requestId);
    console.info(
      JSON.stringify({
        transactionLookup: await lookupTransactions(requestIds, environment.AVALAI_API_KEY),
      }),
    );
  }
}

if (process.argv.includes(VERIFY_IMPORT_FLAG)) {
  console.info("AvalAI smoke harness import verified.");
} else {
  await runManualSmoke();
}
