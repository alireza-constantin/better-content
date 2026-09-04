import "server-only";

import { createAvalAIGenerateContentScriptProvider } from "@/modules/ai/infrastructure/avalai";

import { createContentGenerationApplicationService } from "./content-generation-service";
import { createContentReadApplicationService } from "./content-read-service";

const contentGenerationApplicationService = createContentGenerationApplicationService({
  providerFactory: (userId) => createAvalAIGenerateContentScriptProvider({ userId }),
});
const contentReadApplicationService = createContentReadApplicationService();

export const acceptContentGeneration = contentGenerationApplicationService.acceptContentGeneration;
export const generateContentScript = contentGenerationApplicationService.generateContentScript;
export const retryContentGenerationAttempt =
  contentGenerationApplicationService.retryContentGenerationAttempt;
export const recoverStaleContentGenerationPendingAttempts =
  contentGenerationApplicationService.recoverStalePendingAttempts;
export const recoverStaleContentGenerationRunningAttempts =
  contentGenerationApplicationService.recoverStaleRunningAttempts;

export const listContent = contentReadApplicationService.listContent;
export const getContentDetail = contentReadApplicationService.getContentDetail;
export const getIdeaContentGenerationHistory =
  contentReadApplicationService.getIdeaContentGenerationHistory;
export const getContentGenerationAttemptDetail =
  contentReadApplicationService.getContentGenerationAttemptDetail;
export const getContentGenerationAttemptResult =
  contentReadApplicationService.getContentGenerationAttemptResult;
export const getIdeaContentUsage = contentReadApplicationService.getIdeaContentUsage;
