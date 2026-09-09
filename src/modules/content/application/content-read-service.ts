import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assets } from "@/db/schema";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError, type RateLimitSource } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import {
  contentDocumentSchema,
  contentScriptFormatSchema,
  contentVersionSourceSchema,
  generationLanguageSchema,
  materializeContentDocumentV2,
  projectContentDocumentToV3,
  projectContentDocumentV3ToV2,
  projectContentDocumentV4ToV3,
  extractAssetReferences,
  projectContentDocumentToTeleprompter,
  projectContentDocumentToEditGuide,
  type ContentDocument,
  type ContentDocumentV2,
  type ContentDocumentV3,
  type ContentDocumentV4,
  type ContentVersionSource,
  type ContentScriptFormat,
  type GenerationLanguage,
} from "../domain";
import type { AssetMediaType } from "@/modules/assets/domain";
import {
  parseStoredContentGenerationErrorCategory,
  parseStoredContentGenerationStatus,
  lockContentGenerationWorkspace,
  recoverStalePendingContentGenerationAttemptsInTransaction,
  recoverStaleRunningContentGenerationAttemptsInTransaction,
} from "./content-generation-repository";
import {
  findContentDetail,
  findContentIdeaContext,
  findContentGenerationAttemptDetail,
  findIdeaContentUsage,
  findResultingContentDetail,
  findSourceIdea,
  listContentVersions,
  listContent as listContentRecords,
  listContentForIdea,
  listContentGenerationAttemptsForIdea,
  type ContentDetailRecord,
  type ContentGenerationAttemptReadRecord,
  type ContentListRecord,
  type ContentVersionReadRecord,
  findContentForTeleprompter,
  findContentTeleprompterVersion,
} from "./content-read-repository";
import { requireWorkspaceMembership } from "@/modules/workspace/application";
import { decisionStateSchema, type DecisionState } from "@/modules/ideas/domain";
import type { FailureCategory, GenerationLifecycle } from "@/modules/ai/domain/ai-contracts";

const workspaceInputSchema = z.object({ workspaceId: z.uuid() }).strict();
const contentDetailInputSchema = z.object({ workspaceId: z.uuid(), contentId: z.uuid() }).strict();
const ideaHistoryInputSchema = z.object({ workspaceId: z.uuid(), sourceIdeaId: z.uuid() }).strict();
const attemptDetailInputSchema = z.object({ workspaceId: z.uuid(), attemptId: z.uuid() }).strict();

type ContentReadLogger = Pick<typeof logger, "info" | "warn">;

export type ContentSourceIdeaDto = Readonly<{
  id: string;
  title: string;
}>;

export type ContentListItemDto = Readonly<{
  id: string;
  sourceIdeaTitle: string;
  format: ContentScriptFormat;
  contentLanguage: GenerationLanguage;
  lastEditedAt: Date;
}>;

export type ContentDraftDto = Readonly<{
  /** The authoritative persisted document; legacy schemas remain unchanged on read. */
  document: ContentDocument;
  /** The deterministic, read-only editor projection. It is always V4. */
  editorDocument: ContentDocumentV3 | ContentDocumentV4;
  /** A pre-Asset compatibility view for the existing structured editor. */
  v2Projection?: ContentDocumentV2;
  revision: number;
  updatedAt: Date;
}>;

export type ContentVersionDto = Readonly<{
  id: string;
  versionNumber: number;
  document: ContentDocument;
  source: ContentVersionSource;
  createdAt: Date;
  createdByName: string | null;
  isCurrentAccepted: boolean;
}>;

export type ContentDetailDto = Readonly<{
  id: string;
  sourceIdea: ContentSourceIdeaDto;
  contentLanguage: GenerationLanguage;
  format: ContentScriptFormat;
  draft: ContentDraftDto;
  acceptedVersionId: string | null;
  versions: readonly ContentVersionDto[];
  /** Current, safe presentation metadata for immutable V3 identities. */
  assetPresentations?: Readonly<
    Record<string, Readonly<{ displayName: string; mediaType: string }>>
  >;
}>;

export type ContentTeleprompterResult =
  | Readonly<{
      status: "READY";
      contentId: string;
      contentTitle: string;
      contentLanguage: GenerationLanguage;
      acceptedVersionId: string;
      acceptedVersionNumber: number;
      scriptBlocks: ReturnType<typeof projectContentDocumentToTeleprompter>;
    }>
  | Readonly<{
      status: "NO_ACCEPTED_VERSION" | "UNAVAILABLE";
      contentId: string;
      contentTitle: string;
      contentLanguage: GenerationLanguage;
      acceptedVersionId: string | null;
    }>;

export type ContentEditGuideAssetPresentation = Readonly<{
  displayName: string;
  mediaType: AssetMediaType;
  width: number | null;
  height: number | null;
  previewable: boolean;
}>;

export type ContentEditGuideResult =
  | Readonly<{
      status: "READY";
      contentId: string;
      contentTitle: string;
      contentLanguage: GenerationLanguage;
      acceptedVersionId: string;
      acceptedVersionNumber: number;
      scriptBlocks: ReturnType<typeof projectContentDocumentToEditGuide>;
      assetPresentations: Readonly<Record<string, ContentEditGuideAssetPresentation>>;
    }>
  | Readonly<{
      status: "NO_ACCEPTED_VERSION" | "UNAVAILABLE";
      contentId: string;
      contentTitle: string;
      contentLanguage: GenerationLanguage;
      acceptedVersionId: string | null;
    }>;

async function loadAssetPresentations(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  versions: readonly ContentVersionDto[],
) {
  const ids = [
    ...new Set(
      versions.flatMap((version) =>
        extractAssetReferences(version.document).map((reference) => reference.assetId),
      ),
    ),
  ];
  if (!ids.length) return {};
  const rows = await database
    .select({ id: assets.id, displayName: assets.displayName, mediaType: assets.mediaType })
    .from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), inArray(assets.id, ids)));
  return Object.fromEntries(
    rows.map((row) => [row.id, { displayName: row.displayName, mediaType: row.mediaType }]),
  );
}

async function loadEditGuideAssetPresentations(
  database: Pick<typeof db, "select">,
  workspaceId: string,
  document: ContentDocument,
): Promise<Readonly<Record<string, ContentEditGuideAssetPresentation>>> {
  if (document.schemaVersion !== 3 && document.schemaVersion !== 4) return {};

  const allowedTypes = new Map<string, Set<AssetMediaType>>();
  for (const block of document.script.blocks) {
    for (const direction of block.editDirections) {
      if ((direction.type !== "BROLL_CUE" && direction.type !== "SOUND_CUE") || !direction.assetId)
        continue;
      const types: readonly AssetMediaType[] =
        direction.type === "BROLL_CUE" ? ["IMAGE", "VIDEO"] : ["AUDIO"];
      const existing = allowedTypes.get(direction.assetId) ?? new Set<AssetMediaType>();
      for (const type of types) existing.add(type);
      allowedTypes.set(direction.assetId, existing);
    }
  }

  const ids = [...allowedTypes.keys()];
  if (!ids.length) return {};
  const rows = await database
    .select({
      id: assets.id,
      displayName: assets.displayName,
      mediaType: assets.mediaType,
      status: assets.status,
      width: assets.width,
      height: assets.height,
    })
    .from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), inArray(assets.id, ids)));

  return Object.fromEntries(
    rows
      .filter(
        (row) =>
          row.status === "READY" &&
          allowedTypes.get(row.id)?.has(row.mediaType as AssetMediaType) === true,
      )
      .map((row) => {
        const mediaType = row.mediaType as AssetMediaType;
        return [
          row.id,
          {
            displayName: row.displayName,
            mediaType,
            width: row.width,
            height: row.height,
            previewable:
              mediaType !== "IMAGE" ||
              (typeof row.width === "number" &&
                row.width > 0 &&
                typeof row.height === "number" &&
                row.height > 0),
          },
        ] as const;
      }),
  );
}

export type ContentGenerationAttemptHistoryDto = Readonly<{
  id: string;
  status: GenerationLifecycle;
  errorCategory: FailureCategory | null;
  rateLimitSource: RateLimitSource | null;
  requestedLanguage: GenerationLanguage;
  format: ContentScriptFormat;
  instructions: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  resultingContentId: string | null;
}>;

export type ContentGenerationAttemptDetailDto = Readonly<{
  attempt: ContentGenerationAttemptHistoryDto;
  sourceIdea: ContentSourceIdeaDto;
}>;

export type IdeaContentGenerationHistoryDto = Readonly<{
  sourceIdea: ContentSourceIdeaDto;
  isUsed: boolean;
  attempts: readonly ContentGenerationAttemptHistoryDto[];
}>;

export type IdeaContentUsageDto = Readonly<{
  ideaId: string;
  isUsed: boolean;
}>;

export type ContentByIdeaDto = Readonly<{
  sourceIdea: Readonly<{
    id: string;
    title: string;
    description: string;
    language: GenerationLanguage;
    status: DecisionState;
  }>;
  content: readonly ContentDetailDto[];
  history: IdeaContentGenerationHistoryDto;
}>;

export type ContentReadApplicationServiceDependencies = Readonly<{
  database?: typeof db;
  getAuthenticatedUserId?: () => Promise<string | null>;
  clock?: () => Date;
  logger?: ContentReadLogger;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ApplicationError("VALIDATION_ERROR", message);
  }

  return result.data;
}

function notFound(resource: string): ApplicationError {
  return new ApplicationError("NOT_FOUND", `The requested ${resource} was not found.`);
}

function parseStoredContentLanguage(value: string): GenerationLanguage {
  const result = generationLanguageSchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The Content language invariant is invalid.");
  }

  return result.data;
}

function parseStoredContentFormat(value: string): ContentScriptFormat {
  const result = contentScriptFormatSchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError("INTERNAL_ERROR", "The Content format invariant is invalid.");
  }

  return result.data;
}

function parseStoredDraftDocument(value: unknown): ContentDocument {
  const result = contentDocumentSchema.safeParse(value);

  if (!result.success) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The Content Draft document invariant is invalid.",
    );
  }

  return result.data;
}

function toDraftDto(record: ContentDetailRecord["draft"]): ContentDraftDto {
  const document = parseStoredDraftDocument(record.document);

  try {
    return {
      document,
      editorDocument: projectContentDocumentToV3(document),
      v2Projection:
        document.schemaVersion === 1
          ? materializeContentDocumentV2(document)
          : document.schemaVersion === 2
            ? document
            : projectContentDocumentV3ToV2(
                document.schemaVersion === 4 ? projectContentDocumentV4ToV3(document) : document,
              ),
      revision: record.revision,
      updatedAt: record.updatedAt,
    };
  } catch {
    // An over-limit legacy projection is a safe, nondestructive validation
    // result. The stored V1 document has not been touched.
    throw new ApplicationError("VALIDATION_ERROR", "The legacy Content Draft cannot be projected.");
  }
}

function toContentListItem(record: ContentListRecord): ContentListItemDto {
  return {
    id: record.content.id,
    sourceIdeaTitle: record.sourceIdeaTitle,
    format: parseStoredContentFormat(record.content.format),
    contentLanguage: parseStoredContentLanguage(record.content.contentLanguage),
    lastEditedAt: record.draft.updatedAt,
  };
}

function toContentVersion(
  record: ContentVersionReadRecord,
  acceptedVersionId: string | null,
): ContentVersionDto {
  const source = contentVersionSourceSchema.safeParse(record.version.source);
  const document = contentDocumentSchema.safeParse(record.version.document);

  if (
    !source.success ||
    !document.success ||
    !Number.isInteger(record.version.versionNumber) ||
    record.version.versionNumber <= 0
  ) {
    throw new ApplicationError("INTERNAL_ERROR", "The Content Version invariant is invalid.");
  }

  return {
    id: record.version.id,
    versionNumber: record.version.versionNumber,
    document: document.data,
    source: source.data,
    createdAt: record.version.createdAt,
    createdByName: record.createdByName,
    isCurrentAccepted: record.version.id === acceptedVersionId,
  };
}

function toContentDetail(
  record: ContentDetailRecord,
  versionRecords?: readonly ContentVersionReadRecord[],
): ContentDetailDto {
  // Content-by-Idea uses the lightweight detail shape; the editor detail path
  // supplies the version records and therefore validates the accepted pointer.
  const versions = (versionRecords ?? []).map((version) =>
    toContentVersion(version, record.content.acceptedVersionId),
  );
  if (record.content.acceptedVersionId && versionRecords) {
    const accepted = versions.find((version) => version.isCurrentAccepted);
    if (!accepted || accepted.source !== "CREATOR_ACCEPTED") {
      throw new ApplicationError("INTERNAL_ERROR", "The accepted Content pointer is invalid.");
    }
  }

  return {
    id: record.content.id,
    sourceIdea: {
      id: record.sourceIdea.id,
      title: record.sourceIdea.title,
    },
    contentLanguage: parseStoredContentLanguage(record.content.contentLanguage),
    format: parseStoredContentFormat(record.content.format),
    draft: toDraftDto(record.draft),
    acceptedVersionId: record.content.acceptedVersionId,
    versions,
  };
}

function toAttemptHistory(
  record: ContentGenerationAttemptReadRecord,
): ContentGenerationAttemptHistoryDto {
  const requestedLanguage = parseStoredContentLanguage(record.attempt.requestedLanguage);
  const format = parseStoredContentFormat(record.attempt.format);
  const status = parseStoredContentGenerationStatus(record.attempt.status);
  const errorCategory = parseStoredContentGenerationErrorCategory(record.attempt.errorCategory);

  if (status === "COMPLETED" && record.resultingContentId === null) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "The completed Content generation has no resulting Content.",
    );
  }

  if (status !== "COMPLETED" && record.resultingContentId !== null) {
    throw new ApplicationError(
      "INTERNAL_ERROR",
      "An active or failed Content generation has a resulting Content.",
    );
  }

  return {
    id: record.attempt.id,
    status,
    errorCategory,
    rateLimitSource: status === "FAILED" && errorCategory === "RATE_LIMITED" ? "provider" : null,
    requestedLanguage,
    format,
    instructions: record.attempt.instructions,
    createdAt: record.attempt.createdAt,
    startedAt: record.attempt.startedAt,
    completedAt: record.attempt.completedAt,
    failedAt: record.attempt.failedAt,
    resultingContentId: record.resultingContentId,
  };
}

async function recoverStaleForAuthorizedRead(
  database: typeof db,
  userId: string,
  workspaceId: string,
  clock: () => Date,
): Promise<number> {
  return database.transaction(async (transaction) => {
    await lockContentGenerationWorkspace(transaction, workspaceId);
    await requireWorkspaceMembership(userId, workspaceId, transaction);
    const recoveredAt = clock();
    const pending = await recoverStalePendingContentGenerationAttemptsInTransaction(
      transaction,
      workspaceId,
      recoveredAt,
    );
    const running = await recoverStaleRunningContentGenerationAttemptsInTransaction(
      transaction,
      workspaceId,
      recoveredAt,
    );

    return pending + running;
  });
}

function logRead(
  serviceLogger: ContentReadLogger,
  event: string,
  context: Readonly<{ userId: string; workspaceId: string; entityId?: string }>,
): void {
  serviceLogger.info(event, {
    userId: context.userId,
    workspaceId: context.workspaceId,
    ...(context.entityId ? { entityId: context.entityId } : {}),
    module: "content",
    operation: "contentRead",
  });
}

export function createContentReadApplicationService(
  dependencies: ContentReadApplicationServiceDependencies = {},
): Readonly<{
  listContent(input: unknown): Promise<readonly ContentListItemDto[]>;
  getContentByIdea(input: unknown): Promise<ContentByIdeaDto>;
  getContentDetail(input: unknown): Promise<ContentDetailDto>;
  getTeleprompter(input: unknown): Promise<ContentTeleprompterResult>;
  getEditGuide(input: unknown): Promise<ContentEditGuideResult>;
  getIdeaContentGenerationHistory(input: unknown): Promise<IdeaContentGenerationHistoryDto>;
  getContentGenerationAttemptDetail(input: unknown): Promise<ContentGenerationAttemptDetailDto>;
  getContentGenerationAttemptResult(input: unknown): Promise<ContentDetailDto | null>;
  getIdeaContentUsage(input: unknown): Promise<IdeaContentUsageDto>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId =
    dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const clock = dependencies.clock ?? (() => new Date());
  const serviceLogger = dependencies.logger ?? logger;

  async function authorizeRead<T extends Readonly<{ workspaceId: string }>>(
    input: unknown,
    schema: z.ZodType<T>,
    message: string,
  ): Promise<{ userId: string; input: T }> {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
    }

    const parsedInput = parseInput(schema, input, message);
    await requireWorkspaceMembership(userId, parsedInput.workspaceId, database);

    return { userId, input: parsedInput };
  }

  async function recoverActiveOperations(userId: string, workspaceId: string): Promise<void> {
    const recovered = await recoverStaleForAuthorizedRead(database, userId, workspaceId, clock);

    if (recovered > 0) {
      serviceLogger.info("content.read.stale_recovered", {
        workspaceId,
        module: "content",
        operation: "contentRead",
      });
    }
  }

  return {
    async listContent(input: unknown): Promise<readonly ContentListItemDto[]> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        workspaceInputSchema,
        "The Content list request is invalid.",
      );
      const records = await listContentRecords(database, parsedInput.workspaceId);
      const result = records.map(toContentListItem);

      logRead(serviceLogger, "content.list.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
      });

      return result;
    },

    async getContentByIdea(input: unknown): Promise<ContentByIdeaDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        ideaHistoryInputSchema,
        "The Content-by-Idea request is invalid.",
      );
      await recoverActiveOperations(userId, parsedInput.workspaceId);

      const sourceIdea = await findContentIdeaContext(
        database,
        parsedInput.workspaceId,
        parsedInput.sourceIdeaId,
      );

      if (!sourceIdea) {
        throw notFound("source Idea");
      }

      const language = parseStoredContentLanguage(sourceIdea.language);
      const status = decisionStateSchema.safeParse(sourceIdea.status);

      if (!status.success) {
        throw new ApplicationError("INTERNAL_ERROR", "The source Idea decision state is invalid.");
      }

      const [contentRecords, attempts, isUsed] = await Promise.all([
        listContentForIdea(database, parsedInput.workspaceId, parsedInput.sourceIdeaId),
        listContentGenerationAttemptsForIdea(
          database,
          parsedInput.workspaceId,
          parsedInput.sourceIdeaId,
        ),
        findIdeaContentUsage(database, parsedInput.workspaceId, parsedInput.sourceIdeaId),
      ]);

      logRead(serviceLogger, "content.idea_context.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.sourceIdeaId,
      });

      return {
        sourceIdea: {
          id: sourceIdea.id,
          title: sourceIdea.title,
          description: sourceIdea.description,
          language,
          status: status.data,
        },
        content: contentRecords.map((record) => toContentDetail(record)),
        history: {
          sourceIdea: { id: sourceIdea.id, title: sourceIdea.title },
          isUsed,
          attempts: attempts.map(toAttemptHistory),
        },
      };
    },

    async getContentDetail(input: unknown): Promise<ContentDetailDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        contentDetailInputSchema,
        "The Content detail request is invalid.",
      );
      const record = await findContentDetail(
        database,
        parsedInput.workspaceId,
        parsedInput.contentId,
      );

      if (!record) {
        throw notFound("Content");
      }

      logRead(serviceLogger, "content.detail.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.contentId,
      });

      const versions = await listContentVersions(
        database,
        parsedInput.workspaceId,
        parsedInput.contentId,
      );

      const detail = toContentDetail(record, versions);
      return {
        ...detail,
        assetPresentations: await loadAssetPresentations(
          database,
          parsedInput.workspaceId,
          detail.versions,
        ),
      };
    },

    async getTeleprompter(input: unknown): Promise<ContentTeleprompterResult> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        contentDetailInputSchema,
        "The Teleprompter request is invalid.",
      );
      const record = await findContentForTeleprompter(
        database,
        parsedInput.workspaceId,
        parsedInput.contentId,
      );

      if (!record) {
        throw notFound("Content");
      }

      const contentLanguage = parseStoredContentLanguage(record.content.contentLanguage);
      const base = {
        contentId: record.content.id,
        contentTitle: record.sourceIdea.title,
        contentLanguage,
        acceptedVersionId: record.content.acceptedVersionId,
      } as const;

      if (!record.content.acceptedVersionId) {
        logRead(serviceLogger, "content.teleprompter.no_accepted_version", {
          userId,
          workspaceId: parsedInput.workspaceId,
          entityId: parsedInput.contentId,
        });
        return { ...base, status: "NO_ACCEPTED_VERSION" };
      }

      const version = await findContentTeleprompterVersion(
        database,
        parsedInput.workspaceId,
        record.content.id,
        record.content.acceptedVersionId,
      );
      const parsedDocument = version
        ? contentDocumentSchema.safeParse(version.version.document)
        : null;
      const isValidVersion =
        version !== undefined &&
        version.version.source === "CREATOR_ACCEPTED" &&
        Number.isInteger(version.version.versionNumber) &&
        version.version.versionNumber > 0 &&
        parsedDocument?.success === true;

      if (!isValidVersion || !parsedDocument?.success) {
        serviceLogger.warn("content.teleprompter.accepted_version_unavailable", {
          userId,
          workspaceId: parsedInput.workspaceId,
          entityId: parsedInput.contentId,
          module: "content",
          operation: "contentRead",
        });
        return { ...base, acceptedVersionId: null, status: "UNAVAILABLE" };
      }

      try {
        const result: ContentTeleprompterResult = {
          ...base,
          status: "READY",
          acceptedVersionId: record.content.acceptedVersionId,
          acceptedVersionNumber: version.version.versionNumber,
          scriptBlocks: projectContentDocumentToTeleprompter(parsedDocument.data),
        };
        logRead(serviceLogger, "content.teleprompter.loaded", {
          userId,
          workspaceId: parsedInput.workspaceId,
          entityId: parsedInput.contentId,
        });
        return result;
      } catch {
        serviceLogger.warn("content.teleprompter.accepted_version_unavailable", {
          userId,
          workspaceId: parsedInput.workspaceId,
          entityId: parsedInput.contentId,
          module: "content",
          operation: "contentRead",
        });
        return { ...base, acceptedVersionId: null, status: "UNAVAILABLE" };
      }
    },

    async getEditGuide(input: unknown): Promise<ContentEditGuideResult> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        contentDetailInputSchema,
        "The Edit Guide request is invalid.",
      );
      const record = await findContentForTeleprompter(
        database,
        parsedInput.workspaceId,
        parsedInput.contentId,
      );

      if (!record) {
        throw notFound("Content");
      }

      const contentLanguage = parseStoredContentLanguage(record.content.contentLanguage);
      const base = {
        contentId: record.content.id,
        contentTitle: record.sourceIdea.title,
        contentLanguage,
        acceptedVersionId: record.content.acceptedVersionId,
      } as const;

      if (!record.content.acceptedVersionId) {
        logRead(serviceLogger, "content.edit_guide.no_accepted_version", {
          userId,
          workspaceId: parsedInput.workspaceId,
          entityId: parsedInput.contentId,
        });
        return { ...base, status: "NO_ACCEPTED_VERSION" };
      }

      const version = await findContentTeleprompterVersion(
        database,
        parsedInput.workspaceId,
        record.content.id,
        record.content.acceptedVersionId,
      );
      const parsedDocument = version
        ? contentDocumentSchema.safeParse(version.version.document)
        : null;
      const isValidVersion =
        version !== undefined &&
        version.version.source === "CREATOR_ACCEPTED" &&
        Number.isInteger(version.version.versionNumber) &&
        version.version.versionNumber > 0 &&
        parsedDocument?.success === true;

      if (!isValidVersion || !parsedDocument?.success) {
        serviceLogger.warn("content.edit_guide.accepted_version_unavailable", {
          userId,
          workspaceId: parsedInput.workspaceId,
          entityId: parsedInput.contentId,
          module: "content",
          operation: "contentRead",
        });
        return { ...base, acceptedVersionId: null, status: "UNAVAILABLE" };
      }

      try {
        const result: ContentEditGuideResult = {
          ...base,
          status: "READY",
          acceptedVersionId: record.content.acceptedVersionId,
          acceptedVersionNumber: version.version.versionNumber,
          scriptBlocks: projectContentDocumentToEditGuide(parsedDocument.data),
          assetPresentations: await loadEditGuideAssetPresentations(
            database,
            parsedInput.workspaceId,
            parsedDocument.data,
          ),
        };
        logRead(serviceLogger, "content.edit_guide.loaded", {
          userId,
          workspaceId: parsedInput.workspaceId,
          entityId: parsedInput.contentId,
        });
        return result;
      } catch {
        serviceLogger.warn("content.edit_guide.accepted_version_unavailable", {
          userId,
          workspaceId: parsedInput.workspaceId,
          entityId: parsedInput.contentId,
          module: "content",
          operation: "contentRead",
        });
        return { ...base, acceptedVersionId: null, status: "UNAVAILABLE" };
      }
    },

    async getIdeaContentGenerationHistory(
      input: unknown,
    ): Promise<IdeaContentGenerationHistoryDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        ideaHistoryInputSchema,
        "The Content generation history request is invalid.",
      );
      await recoverActiveOperations(userId, parsedInput.workspaceId);

      const sourceIdea = await findSourceIdea(
        database,
        parsedInput.workspaceId,
        parsedInput.sourceIdeaId,
      );

      if (!sourceIdea) {
        throw notFound("source Idea");
      }

      const [records, isUsed] = await Promise.all([
        listContentGenerationAttemptsForIdea(
          database,
          parsedInput.workspaceId,
          parsedInput.sourceIdeaId,
        ),
        findIdeaContentUsage(database, parsedInput.workspaceId, parsedInput.sourceIdeaId),
      ]);

      logRead(serviceLogger, "content.attempt_history.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.sourceIdeaId,
      });

      return {
        sourceIdea,
        isUsed,
        attempts: records.map(toAttemptHistory),
      };
    },

    async getContentGenerationAttemptDetail(
      input: unknown,
    ): Promise<ContentGenerationAttemptDetailDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        attemptDetailInputSchema,
        "The Content generation Attempt request is invalid.",
      );
      await recoverActiveOperations(userId, parsedInput.workspaceId);

      const record = await findContentGenerationAttemptDetail(
        database,
        parsedInput.workspaceId,
        parsedInput.attemptId,
      );

      if (!record) {
        throw notFound("Content generation Attempt");
      }

      logRead(serviceLogger, "content.attempt_detail.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.attemptId,
      });

      return {
        attempt: toAttemptHistory(record),
        sourceIdea: record.sourceIdea,
      };
    },

    async getContentGenerationAttemptResult(input: unknown): Promise<ContentDetailDto | null> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        attemptDetailInputSchema,
        "The Content generation result request is invalid.",
      );
      await recoverActiveOperations(userId, parsedInput.workspaceId);

      const attempt = await findContentGenerationAttemptDetail(
        database,
        parsedInput.workspaceId,
        parsedInput.attemptId,
      );

      if (!attempt) {
        throw notFound("Content generation Attempt");
      }

      const attemptDto = toAttemptHistory(attempt);

      if (!attemptDto.resultingContentId) {
        return null;
      }

      const result = await findResultingContentDetail(
        database,
        parsedInput.workspaceId,
        parsedInput.attemptId,
      );

      if (!result) {
        throw new ApplicationError(
          "INTERNAL_ERROR",
          "The resulting Content detail could not be loaded.",
        );
      }

      logRead(serviceLogger, "content.attempt_result.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.attemptId,
      });

      const versions = await listContentVersions(
        database,
        parsedInput.workspaceId,
        result.content.id,
      );

      const detail = toContentDetail(result, versions);
      return {
        ...detail,
        assetPresentations: await loadAssetPresentations(
          database,
          parsedInput.workspaceId,
          detail.versions,
        ),
      };
    },

    async getIdeaContentUsage(input: unknown): Promise<IdeaContentUsageDto> {
      const { userId, input: parsedInput } = await authorizeRead(
        input,
        ideaHistoryInputSchema,
        "The Idea Content usage request is invalid.",
      );
      const sourceIdea = await findSourceIdea(
        database,
        parsedInput.workspaceId,
        parsedInput.sourceIdeaId,
      );

      if (!sourceIdea) {
        throw notFound("source Idea");
      }

      const isUsed = await findIdeaContentUsage(
        database,
        parsedInput.workspaceId,
        parsedInput.sourceIdeaId,
      );

      logRead(serviceLogger, "content.idea_usage.loaded", {
        userId,
        workspaceId: parsedInput.workspaceId,
        entityId: parsedInput.sourceIdeaId,
      });

      return { ideaId: parsedInput.sourceIdeaId, isUsed };
    },
  };
}
