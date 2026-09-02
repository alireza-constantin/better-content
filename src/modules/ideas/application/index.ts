import { createOpenAIGenerateIdeasProvider } from "@/modules/ai/infrastructure/openai";

import { createIdeaGenerationApplicationService } from "./generation-service";

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

export const generateIdeas = ideaGenerationApplicationService.generateIdeas;
export const recoverStaleIdeaGenerationAttempts =
  ideaGenerationApplicationService.recoverStaleAttempts;
