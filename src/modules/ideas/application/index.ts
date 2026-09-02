import { createOpenAIGenerateIdeasProvider } from "@/modules/ai/infrastructure/openai";

import { createIdeaGenerationBatchApplicationService } from "./batch-history-service";
import { createIdeaDecisionApplicationService } from "./idea-decision-service";
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
export { type IdeaDto } from "./idea-dto";
export {
  createIdeaGenerationApplicationService,
  ideaGenerationSettings,
  type GenerateIdeasInput,
  type IdeaGenerationApplicationServiceDependencies,
  type IdeaGenerationBatchDto,
  type IdeaGenerationResult,
} from "./generation-service";

const ideaGenerationApplicationService = createIdeaGenerationApplicationService({
  providerFactory: (userId) => createOpenAIGenerateIdeasProvider({ userId }),
});
const ideaGenerationBatchApplicationService = createIdeaGenerationBatchApplicationService({
  generateIdeas: ideaGenerationApplicationService.generateIdeas,
  recoverStaleAttempts: ideaGenerationApplicationService.recoverStaleAttempts,
});
const ideaDecisionApplicationService = createIdeaDecisionApplicationService();

export const generateIdeas = ideaGenerationApplicationService.generateIdeas;
export const recoverStaleIdeaGenerationAttempts =
  ideaGenerationApplicationService.recoverStaleAttempts;
export const listIdeaGenerationBatches = ideaGenerationBatchApplicationService.listBatchHistory;
export const getIdeaGenerationBatchHistory = ideaGenerationBatchApplicationService.getBatchHistory;
export const getIdeaGenerationBatch = ideaGenerationBatchApplicationService.getBatchDetail;
export const retryIdeaGeneration = ideaGenerationBatchApplicationService.retryBatch;
export const updateIdeaDecision = ideaDecisionApplicationService.updateIdeaDecision;
