import "server-only";

import { z } from "zod";

import { db } from "@/db";
import {
  contentDocumentSchema,
  contentDocumentV2Schema,
  contentDocumentV3Schema,
  contentVersionSourceSchema,
  canonicalizeContentDocumentV2,
  contentDocumentsEqual,
  materializeContentDocumentV2,
  projectContentDocumentV2ToV3,
  canonicalizeContentDocumentV3,
  type ContentDocument,
  type ContentDocumentV3,
} from "../domain";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import { requireWorkspaceOwner } from "@/modules/workspace/application";
import type { ContentDraftDto, ContentVersionDto } from "./content-read-service";
import {
  createContentAcceptanceVersion,
  createImmutableContentVersion,
  findAcceptedContentVersion,
  lockContentForAcceptance,
  nextContentVersionNumber,
  setAcceptedContentVersion,
  updateContentDraftForLegacyAcceptance,
} from "./content-acceptance-repository";
import { hasLegacyDraftCheckpoint } from "./content-draft-repository";
import {
  reconcileAssetReferencesForArtifact,
  validateReferencedAssets,
} from "./asset-reference-repository";

const acceptContentInputSchema = z
  .object({
    workspaceId: z.uuid(),
    contentId: z.uuid(),
    expectedDraftRevision: z.number().int().positive(),
  })
  .strict();

type ContentAcceptanceLogger = Pick<typeof logger, "info" | "warn">;

export type AcceptContentInput = Readonly<{
  workspaceId: string;
  contentId: string;
  expectedDraftRevision: number;
}>;

export type ContentAcceptanceApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  clock?: () => Date;
  logger?: ContentAcceptanceLogger;
}>;

export type ContentAcceptanceResultDto = Readonly<{
  draft: ContentDraftDto;
  acceptedVersion: ContentVersionDto;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();
  return session?.user.id ?? null;
}

function parseInput(input: unknown): AcceptContentInput {
  const result = acceptContentInputSchema.safeParse(input);
  if (!result.success) {
    throw new ApplicationError("VALIDATION_ERROR", "The Content acceptance request is invalid.");
  }
  return result.data;
}

function parseStoredDocument(value: unknown): ContentDocument {
  const result = contentDocumentSchema.safeParse(value);
  if (!result.success) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content Draft document invariant is invalid.",
    );
  }
  return result.data;
}

function parseStoredStructuredDocument(value: unknown): ContentDocument {
  try {
    const document = contentDocumentSchema.parse(value);
    return document.schemaVersion === 2
      ? canonicalizeContentDocumentV2(contentDocumentV2Schema.parse(document))
      : canonicalizeContentDocumentV3(contentDocumentV3Schema.parse(document));
  } catch {
    throw new ApplicationError("INTERNAL_ERROR", "The structured Content Draft is invalid.");
  }
}

function toDraftDto(
  draft: typeof import("@/db/schema").contentDrafts.$inferSelect,
): ContentDraftDto {
  const document = parseStoredDocument(draft.document);

  return {
    document,
    revision: draft.revision,
    updatedAt: draft.updatedAt,
  };
}

function toAcceptedVersionDto(
  version: typeof import("@/db/schema").contentVersions.$inferSelect,
): ContentVersionDto {
  const source = contentVersionSourceSchema.safeParse(version.source);
  const document = contentDocumentSchema.safeParse(version.document);

  if (!source.success || !document.success || source.data !== "CREATOR_ACCEPTED") {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The accepted Content Version invariant is invalid.",
    );
  }

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    document: document.data,
    source: source.data,
    createdAt: version.createdAt,
    createdByName: null,
    isCurrentAccepted: true,
  };
}

function resultFrom(
  draft: typeof import("@/db/schema").contentDrafts.$inferSelect,
  version: typeof import("@/db/schema").contentVersions.$inferSelect,
): ContentAcceptanceResultDto {
  return { draft: toDraftDto(draft), acceptedVersion: toAcceptedVersionDto(version) };
}

export function createContentAcceptanceApplicationService(
  dependencies: ContentAcceptanceApplicationServiceDependencies = {},
): Readonly<{
  acceptContent(input: unknown): Promise<ContentAcceptanceResultDto>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;

  async function acceptContent(input: unknown): Promise<ContentAcceptanceResultDto> {
    const userId = await getAuthenticatedUserId();
    if (!userId) throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");

    const parsedInput = parseInput(input);

    try {
      await requireWorkspaceOwner(userId, parsedInput.workspaceId, database);

      const result = await database.transaction(async (transaction) => {
        await requireWorkspaceOwner(userId, parsedInput.workspaceId, transaction);

        const target = await lockContentForAcceptance(
          transaction,
          parsedInput.workspaceId,
          parsedInput.contentId,
        );

        if (!target) {
          throw new ApplicationError("NOT_FOUND", "The requested Content was not found.");
        }

        // Revision validation intentionally precedes any accepted-Version
        // lookup or equality/idempotency decision.
        if (target.draft.revision !== parsedInput.expectedDraftRevision) {
          throw new ApplicationError(
            "CONFLICT",
            "The Content Draft has changed since it was loaded.",
          );
        }

        const storedDocument = parseStoredDocument(target.draft.document);
        const acceptedVersion = await findAcceptedContentVersion(
          transaction,
          target.content.id,
          target.content.acceptedVersionId,
        );

        if (target.content.acceptedVersionId && !acceptedVersion) {
          throw new ApplicationError("INTERNAL_ERROR", "The accepted Content Version is missing.");
        }

        if (acceptedVersion) {
          const source = contentVersionSourceSchema.safeParse(acceptedVersion.source);
          if (!source.success || source.data !== "CREATOR_ACCEPTED") {
            throw new ApplicationError(
              "INTERNAL_ERROR",
              "The accepted Content Version source is invalid.",
            );
          }
        }

        // A legacy acceptance is an explicit migration event. The checkpoint,
        // V2 Draft, accepted Version, pointer, and revision all share this
        // transaction; any failure rolls back every part.
        if (storedDocument.schemaVersion === 1) {
          if (await hasLegacyDraftCheckpoint(transaction, target.content.id)) {
            throw new ApplicationError(
              "INTERNAL_ERROR",
              "The Content Draft migration invariant is invalid.",
            );
          }

          let migratedDocument: ContentDocumentV3;
          try {
            migratedDocument = projectContentDocumentV2ToV3(
              materializeContentDocumentV2(storedDocument),
            );
          } catch {
            throw new ApplicationError(
              "VALIDATION_ERROR",
              "The legacy Content Draft cannot be accepted because it exceeds structured editor limits.",
            );
          }
          const acceptedAt = clock();
          const checkpointNumber = await nextContentVersionNumber(transaction, target.content.id);

          await createImmutableContentVersion(transaction, {
            contentId: target.content.id,
            versionNumber: checkpointNumber,
            document: storedDocument,
            source: "LEGACY_DRAFT_CHECKPOINT",
            createdByUserId: userId,
            createdAt: acceptedAt,
          });

          const migratedDraft = await updateContentDraftForLegacyAcceptance(transaction, {
            contentId: target.content.id,
            expectedRevision: target.draft.revision,
            document: migratedDocument,
            updatedAt: acceptedAt,
          });

          if (!migratedDraft) {
            throw new ApplicationError(
              "CONFLICT",
              "The Content Draft has changed since it was loaded.",
            );
          }

          const acceptedNumber = await nextContentVersionNumber(transaction, target.content.id);
          const accepted = await createContentAcceptanceVersion(transaction, {
            contentId: target.content.id,
            versionNumber: acceptedNumber,
            document: migratedDocument,
            createdByUserId: userId,
            createdAt: acceptedAt,
          });
          await validateReferencedAssets(transaction, parsedInput.workspaceId, migratedDocument);
          await reconcileAssetReferencesForArtifact(transaction, {
            workspaceId: parsedInput.workspaceId,
            contentId: target.content.id,
            artifactKind: "DRAFT",
            document: migratedDocument,
          });
          await reconcileAssetReferencesForArtifact(transaction, {
            workspaceId: parsedInput.workspaceId,
            contentId: target.content.id,
            artifactKind: "VERSION",
            versionId: accepted.id,
            document: migratedDocument,
          });
          const updatedContent = await setAcceptedContentVersion(
            transaction,
            target.content.id,
            accepted.id,
          );

          if (!updatedContent || updatedContent.acceptedVersionId !== accepted.id) {
            throw new ApplicationError(
              "INTERNAL_ERROR",
              "The accepted Content pointer could not be updated.",
            );
          }

          return resultFrom(migratedDraft, accepted);
        }

        const authoritativeDocument = parseStoredStructuredDocument(storedDocument);
        if (
          acceptedVersion &&
          contentDocumentsEqual(acceptedVersion.document, authoritativeDocument)
        ) {
          return resultFrom(target.draft, acceptedVersion);
        }

        const acceptedAt = clock();
        const accepted = await createContentAcceptanceVersion(transaction, {
          contentId: target.content.id,
          versionNumber: await nextContentVersionNumber(transaction, target.content.id),
          document: authoritativeDocument,
          createdByUserId: userId,
          createdAt: acceptedAt,
        });
        await validateReferencedAssets(transaction, parsedInput.workspaceId, authoritativeDocument);
        await reconcileAssetReferencesForArtifact(transaction, {
          workspaceId: parsedInput.workspaceId,
          contentId: target.content.id,
          artifactKind: "VERSION",
          versionId: accepted.id,
          document: authoritativeDocument,
        });
        const updatedContent = await setAcceptedContentVersion(
          transaction,
          target.content.id,
          accepted.id,
        );

        if (!updatedContent || updatedContent.acceptedVersionId !== accepted.id) {
          throw new ApplicationError(
            "INTERNAL_ERROR",
            "The accepted Content pointer could not be updated.",
          );
        }

        return resultFrom(target.draft, accepted);
      });

      serviceLogger.info("content.accepted", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.contentId,
        module: "content",
        operation: "acceptContent",
      });

      return result;
    } catch (error) {
      const applicationError =
        error instanceof ApplicationError
          ? error
          : new ApplicationError("INTERNAL_ERROR", "The Content could not be accepted.");
      serviceLogger.warn("content.accept_failed", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.contentId,
        module: "content",
        operation: "acceptContent",
        errorCode: applicationError.code,
      });
      throw applicationError;
    }
  }

  return { acceptContent };
}

const contentAcceptanceApplicationService = createContentAcceptanceApplicationService();

export const acceptContent = contentAcceptanceApplicationService.acceptContent;
