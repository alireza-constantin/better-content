import { createAvalAIGenerateContentScriptProvider } from "@/modules/ai/infrastructure/avalai";
import { parseAvalAIEnvironment, type AvalAIEnvironment } from "@/lib/env/schema";
import type { GenerateContentScriptRequest } from "@/modules/ai/domain/generate-content-script";
import type { ContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";

const supportedCases = ["en-short", "fa-short", "en-long", "fa-long"] as const;
type SmokeCase = (typeof supportedCases)[number];

const syntheticUserId = "content-contract-smoke-user";
const contentDna: ContentDnaPayload = {
  schemaVersion: 1,
  identity: { creatorOrBrandDescription: "A fictional educator explaining practical skills." },
  audience: { targetAudienceDescription: "Creators learning to explain useful ideas clearly." },
  expertise: { primaryTopics: ["Practical education", "Creative habits"] },
  voice: { toneTraits: ["Warm", "Clear"] },
  goals: { contentGoals: ["Teach useful concepts"] },
  preferences: {
    preferredFormats: ["Educational video"],
    topicsToAvoid: ["Politics"],
    approachesToAvoid: ["Clickbait"],
    additionalInstructions: "Use concrete, safe examples.",
  },
  language: { defaultContentLanguage: "en", contentLanguages: ["en", "fa"] },
};

const sourceIdea = {
  title: "Why clear examples teach faster",
  description: "A practical explanation of how examples make an idea easier to understand.",
  category: "Education",
} as const;

function requestFor(smokeCase: SmokeCase): GenerateContentScriptRequest {
  const [language, length] = smokeCase.split("-") as ["en" | "fa", "short" | "long"];

  return {
    generationKind: "CONTENT_SCRIPT_GENERATION",
    sourceIdea,
    contentDna,
    requestedLanguage: language,
    format: length === "short" ? "SHORT_VIDEO" : "LONG_VIDEO",
    instructions:
      language === "fa"
        ? "Use natural Persian expression and practical examples."
        : "Use natural English expression and practical examples.",
  };
}

function parseArguments(argv: string[]): { cases: SmokeCase[] } | { help: true } {
  if (argv.includes("--help")) {
    return { help: true };
  }

  if (argv.includes("--all")) {
    return { cases: [...supportedCases] };
  }

  const caseIndex = argv.indexOf("--case");
  const selected = caseIndex >= 0 ? argv[caseIndex + 1] : undefined;
  if (selected && supportedCases.includes(selected as SmokeCase)) {
    return { cases: [selected as SmokeCase] };
  }

  throw new Error("Expected --case en-short|fa-short|en-long|fa-long or --all.");
}

function printUsage(): void {
  console.info("Usage: npm run smoke:content -- --case en-short|fa-short|en-long|fa-long");
  console.info("       npm run smoke:content -- --all");
  console.info("This invokes AvalAI and incurs real provider usage/cost.");
}

async function runCase(smokeCase: SmokeCase, environment: AvalAIEnvironment) {
  let diagnostic:
    | {
        errorCategory: string;
        httpStatus?: number;
        providerErrorName?: string;
        providerRequestCorrelation?: string;
      }
    | undefined;
  const provider = createAvalAIGenerateContentScriptProvider({
    userId: syntheticUserId,
    environment,
    onProviderFailure: (value) => {
      diagnostic = value;
    },
  });

  try {
    const result = await provider.generateContentScript(requestFor(smokeCase));
    if (!result.ok) {
      return {
        case: smokeCase,
        ok: false,
        errorCategory: result.errorCategory,
        ...diagnostic,
      };
    }

    if (!("blocks" in result.output.script)) {
      return { case: smokeCase, ok: false, errorCategory: "INVALID_OUTPUT" };
    }

    const blockCount = result.output.script.blocks.length;
    const directionCount = result.output.script.blocks.reduce(
      (total, block) => total + block.performanceDirections.length + block.editDirections.length,
      0,
    );

    return {
      case: smokeCase,
      ok: true,
      schemaVersion: result.output.schemaVersion,
      blockCount,
      directionCount,
      providerRequestCorrelation: result.providerRequestCorrelation ?? null,
    };
  } catch {
    return {
      case: smokeCase,
      ok: false,
      errorCategory: diagnostic?.errorCategory ?? "UNKNOWN",
      ...diagnostic,
    };
  }
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if ("help" in parsed) {
    printUsage();
    return;
  }

  printUsage();
  const environment = parseAvalAIEnvironment(process.env);
  const results = [];
  for (const smokeCase of parsed.cases) {
    results.push(await runCase(smokeCase, environment));
  }

  console.info(JSON.stringify({ results }));
  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch {
  console.error(JSON.stringify({ ok: false, errorCategory: "UNKNOWN" }));
  process.exitCode = 1;
}
