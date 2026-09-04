import "server-only";

import { cookies } from "next/headers";

import { createAvalAIGenerateContentScriptProvider } from "@/modules/ai/infrastructure/avalai";
import {
  createFakeGenerateContentScriptProvider,
  fakeGenerateContentScriptScenarios,
  type FakeGenerateContentScriptScenario,
} from "@/modules/ai/testing/fake-generate-content-script-provider";
import { recordE2eContentProviderInvocation } from "@/modules/ai/testing/e2e-content-provider-telemetry";

import { createContentGenerationApplicationService } from "./content-generation-service";
import { createContentDraftApplicationService } from "./content-draft-service";
import { createContentReadApplicationService } from "./content-read-service";
import { createProductionQueueApplicationService } from "./production-queue-service";

const e2eContentProviderScenarioCookie = "better-content-e2e-content-script-scenario";

function getE2eContentProviderScenario(
  value: string | undefined,
): FakeGenerateContentScriptScenario {
  return value &&
    fakeGenerateContentScriptScenarios.includes(value as FakeGenerateContentScriptScenario)
    ? (value as FakeGenerateContentScriptScenario)
    : "success";
}

async function createContentGenerationProvider(userId: string) {
  if (process.env.BETTER_CONTENT_E2E === "1") {
    const cookieStore = await cookies();

    return createFakeGenerateContentScriptProvider({
      onInvocation: recordE2eContentProviderInvocation,
      scenario: getE2eContentProviderScenario(
        cookieStore.get(e2eContentProviderScenarioCookie)?.value,
      ),
    });
  }

  return createAvalAIGenerateContentScriptProvider({ userId });
}

const contentGenerationApplicationService = createContentGenerationApplicationService({
  providerFactory: createContentGenerationProvider,
});
const contentDraftApplicationService = createContentDraftApplicationService();
const contentReadApplicationService = createContentReadApplicationService();
const productionQueueApplicationService = createProductionQueueApplicationService();

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
export const getContentByIdea = contentReadApplicationService.getContentByIdea;
export const getProductionQueue = productionQueueApplicationService.getProductionQueue;
export const reorderProductionQueue = productionQueueApplicationService.reorderProductionQueue;
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
