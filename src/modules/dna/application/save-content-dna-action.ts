"use server";

import { ApplicationError } from "@/lib/errors/app-error";
import {
  getCurrentContentDna,
  saveContentDna,
  type ContentDnaVersionDto,
  type CurrentContentDnaDto,
} from "@/modules/dna/application";

export type SaveContentDnaActionResult =
  | Readonly<{ ok: true; version: ContentDnaVersionDto }>
  | Readonly<{
      ok: false;
      code:
        | "CONFLICT"
        | "VALIDATION_ERROR"
        | "UNAUTHORIZED"
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "RATE_LIMITED"
        | "PROVIDER_ERROR"
        | "AI_OUTPUT_INVALID"
        | "INTERNAL_ERROR";
    }>;

/** Browser-facing adapter; authorization and canonical validation remain in the application service. */
export async function saveContentDnaAction(
  input: Readonly<{ workspaceId: string; baseVersionId: string | null; payload: unknown }>,
): Promise<SaveContentDnaActionResult> {
  try {
    return { ok: true, version: await saveContentDna(input) };
  } catch (error) {
    if (error instanceof ApplicationError) {
      return { ok: false, code: error.code };
    }

    return { ok: false, code: "INTERNAL_ERROR" };
  }
}

export type LoadCurrentContentDnaActionResult =
  Readonly<{ ok: true; current: CurrentContentDnaDto }> | Readonly<{ ok: false }>;

export async function loadCurrentContentDnaAction(
  workspaceId: string,
): Promise<LoadCurrentContentDnaActionResult> {
  try {
    return { ok: true, current: await getCurrentContentDna({ workspaceId }) };
  } catch {
    return { ok: false };
  }
}
