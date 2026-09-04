import "server-only";

import { createAvalAIGenerateContentScriptProvider } from "@/modules/ai/infrastructure/avalai";

import { createContentGenerationApplicationService } from "./content-generation-service";
import { createContentDraftApplicationService } from "./content-draft-service";
import { createContentReadApplicationService } from "./content-read-service";

const contentGenerationApplicationService = createContentGenerationApplicationService({
  providerFactory: (userId) => createAvalAIGenerateContentScriptProvider({ userId }),
});
const contentDraftApplicationService = createContentDraftApplicationService();
const contentReadApplicationService = createContentReadApplicationService();

export const acceptContentGeneration = contentGenerationApplicationService.acceptContentGeneration;
export const generateContentScript = contentGenerationApplicationService.generateContentScript;
export const retryContentGenerationAttempt =
  contentGenerationApplicationService.retryContentGenerationAttempt;
export const saveContentDraft = contentDraftApplicationService.saveContentDraft;
export const recoverStaleContentGenerationPendingAttempts =
  contentGenerationApplicationService.recoverStalePendingAttempts;
export const recoverStaleContentGenerationRunningAttempts =
  contentGenerationApplicationService.recoverStaleRunningAttempts;

export const listContent = contentReadApplicationService.listContent;
// Ticket 08 reuses Ticket 07's authorized Content-detail DTO as the editor read boundary.
export const getContentDraft = contentReadApplicationService.getContentDetail;
export const getContentDetail = contentReadApplicationService.getContentDetail;
export const getIdeaContentGenerationHistory =
  contentReadApplicationService.getIdeaContentGenerationHistory;
export const getContentGenerationAttemptDetail =
  contentReadApplicationService.getContentGenerationAttemptDetail;
export const getContentGenerationAttemptResult =
  contentReadApplicationService.getContentGenerationAttemptResult;
export const getIdeaContentUsage = contentReadApplicationService.getIdeaContentUsage;
