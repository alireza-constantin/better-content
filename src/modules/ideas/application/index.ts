import { cookies } from "next/headers";

import { createAvalAIGenerateIdeasProvider } from "@/modules/ai/infrastructure/avalai";
import {
  createFakeGenerateIdeasProvider,
  fakeGenerateIdeasScenarios,
  type FakeGenerateIdeasScenario,
} from "@/modules/ai/testing/fake-generate-ideas-provider";
import { recordE2eProviderInvocation } from "@/modules/ai/testing/e2e-provider-telemetry";

import { createIdeaGenerationBatchApplicationService } from "./batch-history-service";
import { createIdeaDecisionApplicationService } from "./idea-decision-service";
import { createIdeaLibraryApplicationService } from "./idea-library-service";
import { createIdeaGenerationApplicationService } from "./generation-service";

export {
  createIdeaGenerationBatchApplicationService,
  type IdeaGenerationBatchApplicationServiceDependencies,
  type IdeaGenerationBatchDetailDto,
  type IdeaGenerationBatchHistoryDto,
  type IdeaGenerationBatchHistoryResult,
} from "./batch-history-service";
export {
  createIdeaDecisionApplicationService,
  type IdeaDecisionApplicationServiceDependencies,
  type IdeaDecisionDto,
} from "./idea-decision-service";
export {
  createIdeaLibraryApplicationService,
  ideaLibraryStatusFilterSchema,
  type IdeaLibraryApplicationServiceDependencies,
  type IdeaLibraryDto,
  type IdeaLibraryItemDto,
  type IdeaLibraryStatusFilter,
} from "./idea-library-service";
export { type IdeaDto } from "./idea-dto";
export {
  createIdeaGenerationApplicationService,
  ideaGenerationSettings,
  type GenerateIdeasInput,
  type IdeaGenerationApplicationServiceDependencies,
  type IdeaGenerationBatchDto,
  type IdeaGenerationResult,
} from "./generation-service";

const e2eProviderScenarioCookie = "better-content-e2e-provider-scenario";

function getE2eProviderScenario(value: string | undefined): FakeGenerateIdeasScenario {
  return value && fakeGenerateIdeasScenarios.includes(value as FakeGenerateIdeasScenario)
    ? (value as FakeGenerateIdeasScenario)
    : "success";
}

async function createIdeaGenerationProvider(userId: string) {
  if (process.env.BETTER_CONTENT_E2E === "1") {
    const cookieStore = await cookies();

    return createFakeGenerateIdeasProvider({
      onInvocation: recordE2eProviderInvocation,
      scenario: getE2eProviderScenario(cookieStore.get(e2eProviderScenarioCookie)?.value),
    });
  }

  return createAvalAIGenerateIdeasProvider({ userId });
}

const ideaGenerationApplicationService = createIdeaGenerationApplicationService({
  providerFactory: createIdeaGenerationProvider,
});
const ideaGenerationBatchApplicationService = createIdeaGenerationBatchApplicationService({
  generateIdeas: ideaGenerationApplicationService.generateIdeas,
  recoverStaleAttempts: ideaGenerationApplicationService.recoverStaleAttempts,
});
const ideaDecisionApplicationService = createIdeaDecisionApplicationService();
const ideaLibraryApplicationService = createIdeaLibraryApplicationService();

export const generateIdeas = ideaGenerationApplicationService.generateIdeas;
export const recoverStaleIdeaGenerationAttempts =
  ideaGenerationApplicationService.recoverStaleAttempts;
export const listIdeaGenerationBatches = ideaGenerationBatchApplicationService.listBatchHistory;
export const getIdeaGenerationBatchHistory = ideaGenerationBatchApplicationService.getBatchHistory;
export const getIdeaGenerationBatch = ideaGenerationBatchApplicationService.getBatchDetail;
export const retryIdeaGeneration = ideaGenerationBatchApplicationService.retryBatch;
export const updateIdeaDecision = ideaDecisionApplicationService.updateIdeaDecision;
export const getIdeaLibrary = ideaLibraryApplicationService.getIdeaLibrary;
