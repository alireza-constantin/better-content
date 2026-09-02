"use server";

import { ApplicationError, type ApplicationErrorCode } from "@/lib/errors/app-error";
import {
  generateIdeas,
  retryIdeaGeneration,
  updateIdeaDecision,
  type IdeaDto,
} from "@/modules/ideas/application";

export type IdeasActionFailure = Readonly<{
  ok: false;
  code: ApplicationErrorCode;
}>;

export type GenerateIdeasActionResult = Readonly<{ ok: true }> | IdeasActionFailure;
export type RetryIdeaGenerationActionResult = Readonly<{ ok: true }> | IdeasActionFailure;
export type UpdateIdeaDecisionActionResult =
  Readonly<{ ok: true; idea: IdeaDto }> | IdeasActionFailure;

function failureFrom(error: unknown): IdeasActionFailure {
  return {
    ok: false,
    code: error instanceof ApplicationError ? error.code : "INTERNAL_ERROR",
  };
}

/**
 * Browser-facing adapters. The application services perform authentication,
 * ownership checks, input validation, and all persistence work.
 */
export async function generateIdeasAction(input: unknown): Promise<GenerateIdeasActionResult> {
  try {
    await generateIdeas(input);
    return { ok: true };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function retryIdeaGenerationAction(
  input: unknown,
): Promise<RetryIdeaGenerationActionResult> {
  try {
    await retryIdeaGeneration(input);
    return { ok: true };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function updateIdeaDecisionAction(
  input: unknown,
): Promise<UpdateIdeaDecisionActionResult> {
  try {
    const result = await updateIdeaDecision(input);

    return {
      ok: true,
      idea: {
        id: result.id,
        batchId: result.batchId,
        position: result.position,
        title: result.title,
        description: result.description,
        category: result.category,
        language: result.language,
        status: result.status,
        rejectionReason: result.rejectionReason,
        statusChangedAt: result.statusChangedAt,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
    };
  } catch (error) {
    return failureFrom(error);
  }
}
