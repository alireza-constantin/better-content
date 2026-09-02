import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { contentDna, contentDnaVersions } from "@/db/schema";
import { ApplicationError } from "@/lib/errors/app-error";
import {
  getContentDnaReadiness,
  parseContentDnaPayload,
  type ContentDnaPayload,
} from "@/modules/dna/domain/content-dna-payload";
import type { GenerationLanguage } from "./generation-types";

function validationError(message: string): ApplicationError {
  return new ApplicationError("VALIDATION_ERROR", message);
}

function conflictError(): ApplicationError {
  return new ApplicationError(
    "CONFLICT",
    "The requested Content DNA version is no longer current.",
  );
}

export function findCurrentContentDna(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  baseVersionId: string,
  requestedLanguage: GenerationLanguage,
): Promise<ContentDnaPayload> {
  return findCurrentContentDnaVersion(database, workspaceId, requestedLanguage).then((current) => {
    if (current.id !== baseVersionId) {
      throw conflictError();
    }

    return current.payload;
  });
}

export type CurrentContentDnaVersion = Readonly<{
  id: string;
  payload: ContentDnaPayload;
}>;

/**
 * Resolves the authoritative current DNA once for retry flows. Generation still
 * rechecks this version in its reservation transaction before it can invoke a provider.
 */
export function findCurrentContentDnaVersion(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  requestedLanguage: GenerationLanguage,
): Promise<CurrentContentDnaVersion> {
  return database
    .select({ container: contentDna, version: contentDnaVersions })
    .from(contentDna)
    .innerJoin(
      contentDnaVersions,
      and(
        eq(contentDna.id, contentDnaVersions.contentDnaId),
        eq(contentDna.currentVersionId, contentDnaVersions.id),
      ),
    )
    .where(eq(contentDna.workspaceId, workspaceId))
    .then(([result]) => {
      if (!result) {
        throw validationError("Complete Content DNA is required before generating ideas.");
      }

      let payload: ContentDnaPayload;

      try {
        payload = parseContentDnaPayload(result.version.payload);
      } catch {
        throw validationError("The current Content DNA is invalid.");
      }

      if (getContentDnaReadiness(payload) !== "AI_READY") {
        throw validationError("Complete Content DNA is required before generating ideas.");
      }

      if (!payload.language?.contentLanguages?.includes(requestedLanguage)) {
        throw validationError("The requested content language is not configured in Content DNA.");
      }

      return { id: result.version.id, payload };
    });
}
