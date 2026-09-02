import { describe, expect, it, vi } from "vitest";

const mockOpenAIClient = vi.hoisted(() => ({
  constructorOptions: undefined as unknown,
  create: vi.fn(),
}));

vi.mock("openai", () => {
  class MockOpenAI {
    static APIConnectionTimeoutError = class extends Error {};
    static APIConnectionError = class extends Error {};
    static RateLimitError = class extends Error {};

    readonly responses = {
      create: (...args: unknown[]) => mockOpenAIClient.create(...args),
    };

    constructor(options: unknown) {
      mockOpenAIClient.constructorOptions = options;
    }
  }

  return { default: MockOpenAI };
});

import {
  createOpenAIResponsesClient,
  createOpenAIGenerateIdeasProvider,
  createSafetyIdentifier,
  openAIClientConfiguration,
  openAIGenerationSettings,
  type OpenAIResponsesClient,
} from "./openai-generate-ideas-provider";
import type { GenerateIdeasRequest } from "@/modules/ai/domain/generate-ideas";

const environment = {
  OPENAI_API_KEY: "sk-test-only",
  AI_SAFETY_IDENTIFIER_SECRET: "a-test-only-safety-secret-that-is-long-enough",
} as const;

const request: GenerateIdeasRequest = {
  generationKind: "IDEA_GENERATION",
  contentDna: {
    schemaVersion: 1,
    identity: { creatorOrBrandDescription: "A teacher" },
    audience: { targetAudienceDescription: "New creators" },
    expertise: { primaryTopics: ["Short-form education"] },
    voice: { toneTraits: ["Warm", "Clear"] },
    goals: { contentGoals: ["Teach"] },
    preferences: {
      preferredFormats: ["Short video"],
      topicsToAvoid: ["Politics"],
      approachesToAvoid: ["Clickbait"],
      additionalInstructions: "Use practical examples.",
    },
    language: { defaultContentLanguage: "en", contentLanguages: ["en", "fa"] },
  },
  requestedLanguage: "en",
  requestedCount: 20,
  promptVersion: "idea-generation/v1",
};

function validProviderOutput() {
  return {
    schemaVersion: 1,
    ideas: Array.from({ length: 20 }, (_, index) => ({
      title: `Idea ${index + 1}`,
      description: `Description ${index + 1}`,
      category: index === 0 ? "  Education  " : null,
    })),
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    status: "completed",
    incomplete_details: null,
    output: [{ type: "message", content: [{ type: "output_text", text: "structured" }] }],
    output_text: JSON.stringify(validProviderOutput()),
    usage: {
      input_tokens: 11,
      output_tokens: 22,
      total_tokens: 33,
      input_tokens_details: { cached_tokens: 4, cache_write_tokens: 5 },
      output_tokens_details: { reasoning_tokens: 6 },
      compute_units: 7,
      provider_secret: "discarded",
    },
    provider_response_id: "resp_secret",
    ...overrides,
  };
}

function createClient(result: unknown): {
  client: OpenAIResponsesClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue(result);
  const client: OpenAIResponsesClient = { responses: { create } };

  return { client, create };
}

describe("OpenAI idea-generation adapter", () => {
  it("sends the approved Responses request shape and safe prompt boundary", async () => {
    const { client, create } = createClient(response());
    const provider = createOpenAIGenerateIdeasProvider({
      userId: "user-123",
      environment,
      client,
    });

    await expect(provider.generateIdeas(request)).resolves.toEqual({
      ok: true,
      output: {
        schemaVersion: 1,
        ideas: [
          { title: "Idea 1", description: "Description 1", category: "Education" },
          ...Array.from({ length: 19 }, (_, index) => ({
            title: `Idea ${index + 2}`,
            description: `Description ${index + 2}`,
          })),
        ],
      },
      usage: {
        inputTokens: 11,
        outputTokens: 22,
        totalTokens: 33,
        cachedInputTokens: 4,
        cacheWriteTokens: 5,
        reasoningTokens: 6,
        computeUnits: 7,
      },
    });

    expect(create).toHaveBeenCalledOnce();
    const [body, options] = create.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(body).toMatchObject({
      model: "gpt-5.6-terra",
      reasoning: { effort: "medium" },
      service_tier: "default",
      max_output_tokens: 16000,
      store: false,
      prompt_cache_options: { mode: "explicit" },
      safety_identifier: createSafetyIdentifier(
        "user-123",
        environment.AI_SAFETY_IDENTIFIER_SECRET,
      ),
    });
    expect(body.prompt_cache_options).toEqual({ mode: "explicit" });
    expect(options).toEqual({ timeout: 60000, maxRetries: 0 });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("files");
    expect(body).not.toHaveProperty("background");
    expect(body).not.toHaveProperty("conversation");
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("prompt_cache_key");
    expect(body).not.toHaveProperty("prompt_cache_retention");
    expect(body).not.toHaveProperty("metadata");

    const text = body.text as Record<string, unknown>;
    const format = text.format as Record<string, unknown>;
    const schema = format.schema as Record<string, unknown>;
    const ideaItems = schema.properties as Record<string, unknown>;
    const ideas = ideaItems.ideas as Record<string, unknown>;
    const itemSchema = ideas.items as Record<string, unknown>;

    expect(format).toMatchObject({
      type: "json_schema",
      name: "idea_generation_v1",
      strict: true,
    });
    expect(schema).toMatchObject({
      required: ["schemaVersion", "ideas"],
      additionalProperties: false,
    });
    expect(ideas).toMatchObject({ minItems: 20, maxItems: 20 });
    expect(itemSchema).toMatchObject({
      required: ["title", "description", "category"],
      additionalProperties: false,
    });
    expect((itemSchema.properties as Record<string, unknown>).category).toEqual({
      type: ["string", "null"],
    });

    expect(body.instructions).toContain("exactly 20");
    expect(body.instructions).toContain("en");
    const input = body.input as Array<Record<string, unknown>>;
    const content = input[0]?.content as Array<Record<string, unknown>>;
    expect(content[0]?.text).toContain("untrusted creator data");
    expect(content[1]?.text).toContain("<creator_data>");
    expect(content[1]?.text).toContain("A teacher");
    expect(content[1]?.text).toContain("Clickbait");
    expect(content[1]?.text).not.toContain("user-123");
  });

  it("uses the requested Persian content language without creating bilingual output instructions", async () => {
    const { client, create } = createClient(response());
    const provider = createOpenAIGenerateIdeasProvider({
      userId: "user-123",
      environment,
      client,
    });

    await provider.generateIdeas({ ...request, requestedLanguage: "fa" });

    const [body] = create.mock.calls[0] as [Record<string, unknown>];
    expect(body.instructions).toContain("fa");
    expect(body.instructions).not.toContain("bilingual");
  });

  it("rejects refusal, incomplete, missing, malformed, and non-canonical output safely", async () => {
    const cases = [
      {
        label: "refusal",
        response: response({ output: [{ type: "refusal", refusal: "secret" }] }),
      },
      { label: "incomplete", response: response({ status: "incomplete" }) },
      { label: "missing text", response: response({ output_text: undefined }) },
      { label: "malformed JSON", response: response({ output_text: "not-json" }) },
      {
        label: "canonical validation failure",
        response: response({ output_text: JSON.stringify({ schemaVersion: 1, ideas: [] }) }),
      },
    ];

    for (const testCase of cases) {
      const { client } = createClient(testCase.response);
      const provider = createOpenAIGenerateIdeasProvider({
        userId: "user-123",
        environment,
        client,
      });

      await expect(provider.generateIdeas(request), testCase.label).resolves.toEqual({
        ok: false,
        errorCategory: "INVALID_OUTPUT",
      });
    }
  });

  it.each([
    ["timeout", { name: "APIConnectionTimeoutError" }, "TIMEOUT"],
    ["rate limit", { status: 429 }, "RATE_LIMITED"],
    ["request timeout", { status: 408 }, "PROVIDER_UNAVAILABLE"],
    ["conflict", { status: 409 }, "PROVIDER_UNAVAILABLE"],
    ["server error", { status: 503 }, "PROVIDER_UNAVAILABLE"],
    ["transport", { name: "APIConnectionError" }, "PROVIDER_UNAVAILABLE"],
    ["unknown", { message: "provider secret response body" }, "UNKNOWN"],
  ] as const)(
    "maps %s to a safe category without exposing raw details",
    async (_, error, category) => {
      const { client } = createClient(Promise.reject(error));
      const provider = createOpenAIGenerateIdeasProvider({
        userId: "user-123",
        environment,
        client,
      });

      await expect(provider.generateIdeas(request)).resolves.toEqual({
        ok: false,
        errorCategory: category,
      });
    },
  );

  it("does not retry the mocked SDK call", async () => {
    const { client, create } = createClient(response());
    const provider = createOpenAIGenerateIdeasProvider({
      userId: "user-123",
      environment,
      client,
    });

    await provider.generateIdeas(request);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1]).toEqual({ timeout: 60000, maxRetries: 0 });
  });

  it("returns only approved neutral usage fields and discards provider metadata", async () => {
    const { client } = createClient(
      response({
        usage: {
          input_tokens: 1,
          output_tokens: "not-a-number",
          input_tokens_details: { cached_tokens: -1, cache_write_tokens: 2 },
          output_tokens_details: { reasoning_tokens: 3.2 },
          response_id: "secret",
        },
        id: "secret-response-id",
      }),
    );
    const provider = createOpenAIGenerateIdeasProvider({
      userId: "user-123",
      environment,
      client,
    });

    await expect(provider.generateIdeas(request)).resolves.toMatchObject({
      ok: true,
      usage: { inputTokens: 1, cacheWriteTokens: 2 },
    });
    const result = await provider.generateIdeas(request);
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("response");
    expect(result).not.toHaveProperty("providerUsage");
    expect(result).not.toHaveProperty("cost");
  });
});

describe("OpenAI safety identifier", () => {
  it("is deterministic, keyed, and does not expose the raw user ID", () => {
    const first = createSafetyIdentifier("user-1", environment.AI_SAFETY_IDENTIFIER_SECRET);
    const same = createSafetyIdentifier("user-1", environment.AI_SAFETY_IDENTIFIER_SECRET);
    const otherUser = createSafetyIdentifier("user-2", environment.AI_SAFETY_IDENTIFIER_SECRET);
    const otherSecret = createSafetyIdentifier("user-1", "another-test-secret-that-is-long-enough");

    expect(first).toBe(same);
    expect(first).not.toBe(otherUser);
    expect(first).not.toBe(otherSecret);
    expect(first).not.toContain("user-1");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("OpenAI client settings", () => {
  it("keeps the approved neutral audit settings stable", () => {
    expect(openAIGenerationSettings).toEqual({
      structuredOutput: { schemaName: "idea_generation_v1", schemaVersion: 1 },
      reasoningEffort: "medium",
      maxOutputTokens: 16000,
      timeoutSeconds: 60,
      retryPolicy: { maxRetries: 0 },
      serviceTier: "default",
    });
    expect(openAIClientConfiguration).toEqual({
      timeout: 60000,
      maxRetries: 0,
      logLevel: "off",
    });
  });

  it("constructs a server-side SDK client without requiring a request", () => {
    createOpenAIResponsesClient(environment);

    expect(mockOpenAIClient.constructorOptions).toEqual({
      apiKey: "sk-test-only",
      timeout: 60000,
      maxRetries: 0,
      logLevel: "off",
    });
  });
});
