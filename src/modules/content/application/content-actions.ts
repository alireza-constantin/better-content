"use server";

import {
  ApplicationError,
  type ApplicationErrorCode,
  type RateLimitSource,
} from "@/lib/errors/app-error";

import {
  getContentDetail,
  getContentDraft,
  getContentGenerationAttemptDetail,
  getContentGenerationAttemptResult,
  getIdeaContentGenerationHistory,
  getIdeaContentUsage,
  listContent,
  retryContentGenerationAttempt,
  generateContentScript,
  saveContentDraft,
} from "./content-application";
import type {
  ContentGenerationAttemptDto,
  ContentGenerationResult,
} from "./content-generation-service";
import type {
  ContentDetailDto,
  ContentDraftDto,
  ContentGenerationAttemptDetailDto,
  ContentListItemDto,
  IdeaContentGenerationHistoryDto,
  IdeaContentUsageDto,
} from "./content-read-service";

export type ContentActionFailure = Readonly<{
  ok: false;
  code: ApplicationErrorCode;
  rateLimitSource?: RateLimitSource;
}>;

export type ListContentActionResult =
  Readonly<{ ok: true; content: readonly ContentListItemDto[] }> | ContentActionFailure;
export type GetContentDetailActionResult =
  Readonly<{ ok: true; content: ContentDetailDto }> | ContentActionFailure;
export type GetContentDraftActionResult = GetContentDetailActionResult;
export type SaveContentDraftActionResult =
  Readonly<{ ok: true; draft: ContentDraftDto }> | ContentActionFailure;
export type GetIdeaContentGenerationHistoryActionResult =
  Readonly<{ ok: true; history: IdeaContentGenerationHistoryDto }> | ContentActionFailure;
export type GetContentGenerationAttemptDetailActionResult =
  Readonly<{ ok: true; attempt: ContentGenerationAttemptDetailDto }> | ContentActionFailure;
export type GetContentGenerationAttemptResultActionResult =
  Readonly<{ ok: true; content: ContentDetailDto | null }> | ContentActionFailure;
export type GetIdeaContentUsageActionResult =
  Readonly<{ ok: true; usage: IdeaContentUsageDto }> | ContentActionFailure;
export type GenerateContentScriptActionResult =
  Readonly<{ ok: true; contentId: string }> | ContentActionFailure;

export type ContentGenerationRetryAttemptDto = Readonly<{
  id: string;
  status: ContentGenerationAttemptDto["status"];
  errorCategory: ContentGenerationAttemptDto["errorCategory"];
  rateLimitSource: ContentGenerationAttemptDto["rateLimitSource"];
  requestedLanguage: ContentGenerationAttemptDto["requestedLanguage"];
  format: ContentGenerationAttemptDto["format"];
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}>;

export type RetryContentGenerationAttemptActionResult =
  | Readonly<{
      ok: true;
      attempt: ContentGenerationRetryAttemptDto;
      contentId: string;
    }>
  | ContentActionFailure;

function failureFrom(error: unknown): ContentActionFailure {
  return {
    ok: false,
    code: error instanceof ApplicationError ? error.code : "INTERNAL_ERROR",
    ...(error instanceof ApplicationError && error.code === "RATE_LIMITED" && error.rateLimitSource
      ? { rateLimitSource: error.rateLimitSource }
      : {}),
  };
}

function toRetryAttemptDto(attempt: ContentGenerationAttemptDto): ContentGenerationRetryAttemptDto {
  return {
    id: attempt.id,
    status: attempt.status,
    errorCategory: attempt.errorCategory,
    rateLimitSource: attempt.rateLimitSource,
    requestedLanguage: attempt.requestedLanguage,
    format: attempt.format,
    createdAt: attempt.createdAt,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    failedAt: attempt.failedAt,
  };
}

function requireResultingContentId(result: ContentGenerationResult): string {
  if (!result.contentId) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The completed Content generation has no resulting Content.",
    );
  }

  return result.contentId;
}

export async function generateContentScriptAction(
  input: unknown,
): Promise<GenerateContentScriptActionResult> {
  try {
    const result = await generateContentScript(input);

    return { ok: true, contentId: requireResultingContentId(result) };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function listContentAction(input: unknown): Promise<ListContentActionResult> {
  try {
    return { ok: true, content: await listContent(input) };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function getContentDetailAction(
  input: unknown,
): Promise<GetContentDetailActionResult> {
  try {
    return { ok: true, content: await getContentDetail(input) };
  } catch (error) {
    return failureFrom(error);
  }
}

/**
 * Editor read alias for the Ticket 07 Content-detail DTO. It intentionally
 * shares the same authorized service and result shape rather than creating a
 * second Content-detail abstraction.
 */
export async function getContentDraftAction(input: unknown): Promise<GetContentDraftActionResult> {
  try {
    return { ok: true, content: await getContentDraft(input) };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function saveContentDraftAction(
  input: unknown,
): Promise<SaveContentDraftActionResult> {
  try {
    return { ok: true, draft: await saveContentDraft(input) };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function getIdeaContentGenerationHistoryAction(
  input: unknown,
): Promise<GetIdeaContentGenerationHistoryActionResult> {
  try {
    return { ok: true, history: await getIdeaContentGenerationHistory(input) };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function getContentGenerationAttemptDetailAction(
  input: unknown,
): Promise<GetContentGenerationAttemptDetailActionResult> {
  try {
    return { ok: true, attempt: await getContentGenerationAttemptDetail(input) };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function getContentGenerationAttemptResultAction(
  input: unknown,
): Promise<GetContentGenerationAttemptResultActionResult> {
  try {
    return { ok: true, content: await getContentGenerationAttemptResult(input) };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function getIdeaContentUsageAction(
  input: unknown,
): Promise<GetIdeaContentUsageActionResult> {
  try {
    return { ok: true, usage: await getIdeaContentUsage(input) };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function retryContentGenerationAttemptAction(
  input: unknown,
): Promise<RetryContentGenerationAttemptActionResult> {
  try {
    const result = await retryContentGenerationAttempt(input);

    return {
      ok: true,
      attempt: toRetryAttemptDto(result.attempt),
      contentId: requireResultingContentId(result),
    };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function retryContentGenerationAction(
  input: unknown,
): Promise<RetryContentGenerationAttemptActionResult> {
  return retryContentGenerationAttemptAction(input);
}
