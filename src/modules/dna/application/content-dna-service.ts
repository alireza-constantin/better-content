import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { contentDna, contentDnaVersions } from "@/db/schema";
import { getServerSession } from "@/lib/auth/server";
import { ApplicationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/server";
import {
  getContentDnaReadiness,
  parseContentDnaPayload,
  type ContentDnaPayload,
  type ContentDnaReadiness,
} from "@/modules/dna/domain/content-dna-payload";
import { requireWorkspaceMembership, requireWorkspaceOwner } from "@/modules/workspace/application";

type ContentDnaDatabase = typeof db;
type ContentDnaVersion = typeof contentDnaVersions.$inferSelect;
type ContentDnaLogger = Pick<typeof logger, "info" | "warn">;

export type ContentDnaVersionDto = Readonly<{
  id: string;
  versionNumber: number;
  payload: ContentDnaPayload;
  readiness: ContentDnaReadiness;
  createdAt: Date;
  isCurrent: boolean;
}>;

export type CurrentContentDnaDto =
  | Readonly<{
      status: "NOT_CREATED";
      currentVersion: null;
    }>
  | Readonly<{
      status: ContentDnaReadiness;
      currentVersion: ContentDnaVersionDto;
    }>;

export type SaveContentDnaInput = Readonly<{
  workspaceId: string;
  baseVersionId: string | null;
  payload: unknown;
}>;

export type ContentDnaApplicationServiceDependencies = Readonly<{
  database?: ContentDnaDatabase;
  getAuthenticatedUserId?: () => Promise<string | null>;
  logger?: ContentDnaLogger;
}>;

async function getServerAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession();

  return session?.user.id ?? null;
}

function parseUuid(value: string, field: string): string {
  const parsed = z.uuid().safeParse(value);

  if (!parsed.success) {
    throw new ApplicationError("VALIDATION_ERROR", `${field} must be a UUID.`);
  }

  return parsed.data;
}

function parseBaseVersionId(value: string | null): string | null {
  return value === null ? null : parseUuid(value, "baseVersionId");
}

function parseSavePayload(payload: unknown): ContentDnaPayload {
  try {
    return parseContentDnaPayload(payload);
  } catch {
    throw new ApplicationError("VALIDATION_ERROR", "The Content DNA payload is invalid.");
  }
}

function toVersionDto(version: ContentDnaVersion, isCurrent: boolean): ContentDnaVersionDto {
  const payload = parseContentDnaPayload(version.payload);

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    payload,
    readiness: getContentDnaReadiness(payload),
    createdAt: version.createdAt,
    isCurrent,
  };
}

function areEquivalentPayloads(left: ContentDnaPayload, right: ContentDnaPayload): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function conflict(): ApplicationError {
  return new ApplicationError("CONFLICT", "The Content DNA version is no longer current.");
}

export function createContentDnaApplicationService(
  dependencies: ContentDnaApplicationServiceDependencies = {},
): Readonly<{
  getCurrentContentDna(input: Readonly<{ workspaceId: string }>): Promise<CurrentContentDnaDto>;
  listContentDnaVersions(input: Readonly<{ workspaceId: string }>): Promise<readonly ContentDnaVersionDto[]>;
  getContentDnaVersion(input: Readonly<{ workspaceId: string; versionId: string }>): Promise<ContentDnaVersionDto>;
  saveContentDna(input: SaveContentDnaInput): Promise<ContentDnaVersionDto>;
}> {
  const database = dependencies.database ?? db;
  const getAuthenticatedUserId = dependencies.getAuthenticatedUserId ?? getServerAuthenticatedUserId;
  const serviceLogger = dependencies.logger ?? logger;

  return {
    async getCurrentContentDna({ workspaceId }: Readonly<{ workspaceId: string }>): Promise<CurrentContentDnaDto> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const validatedWorkspaceId = parseUuid(workspaceId, "workspaceId");
      await requireWorkspaceMembership(userId, validatedWorkspaceId, database);

      const [result] = await database
        .select({ version: contentDnaVersions })
        .from(contentDna)
        .innerJoin(
          contentDnaVersions,
          and(eq(contentDna.id, contentDnaVersions.contentDnaId), eq(contentDna.currentVersionId, contentDnaVersions.id)),
        )
        .where(eq(contentDna.workspaceId, validatedWorkspaceId));

      if (!result) {
        return { status: "NOT_CREATED", currentVersion: null };
      }

      const currentVersion = toVersionDto(result.version, true);

      return { status: currentVersion.readiness, currentVersion };
    },

    async listContentDnaVersions({ workspaceId }: Readonly<{ workspaceId: string }>): Promise<readonly ContentDnaVersionDto[]> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const validatedWorkspaceId = parseUuid(workspaceId, "workspaceId");
      await requireWorkspaceMembership(userId, validatedWorkspaceId, database);

      const versions = await database
        .select({ container: contentDna, version: contentDnaVersions })
        .from(contentDnaVersions)
        .innerJoin(contentDna, eq(contentDnaVersions.contentDnaId, contentDna.id))
        .where(eq(contentDna.workspaceId, validatedWorkspaceId))
        .orderBy(desc(contentDnaVersions.versionNumber));

      return versions.map(({ container, version }) => toVersionDto(version, version.id === container.currentVersionId));
    },

    async getContentDnaVersion({
      workspaceId,
      versionId,
    }: Readonly<{ workspaceId: string; versionId: string }>): Promise<ContentDnaVersionDto> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const validatedWorkspaceId = parseUuid(workspaceId, "workspaceId");
      const validatedVersionId = parseUuid(versionId, "versionId");
      await requireWorkspaceMembership(userId, validatedWorkspaceId, database);

      const [result] = await database
        .select({ container: contentDna, version: contentDnaVersions })
        .from(contentDnaVersions)
        .innerJoin(contentDna, eq(contentDnaVersions.contentDnaId, contentDna.id))
        .where(and(eq(contentDna.workspaceId, validatedWorkspaceId), eq(contentDnaVersions.id, validatedVersionId)));

      if (!result) {
        throw new ApplicationError("NOT_FOUND", "The Content DNA version was not found.");
      }

      return toVersionDto(result.version, result.version.id === result.container.currentVersionId);
    },

    async saveContentDna({ workspaceId, baseVersionId, payload }: SaveContentDnaInput): Promise<ContentDnaVersionDto> {
      const userId = await getAuthenticatedUserId();

      if (!userId) {
        throw new ApplicationError("UNAUTHORIZED", "Authentication is required.");
      }

      const validatedWorkspaceId = parseUuid(workspaceId, "workspaceId");
      const validatedBaseVersionId = parseBaseVersionId(baseVersionId);
      await requireWorkspaceOwner(userId, validatedWorkspaceId, database);
      const normalizedPayload = parseSavePayload(payload);

      try {
        const saved = await database.transaction(async (transaction) => {
          await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${validatedWorkspaceId}, 0))`);
          await requireWorkspaceOwner(userId, validatedWorkspaceId, transaction);

          const [container] = await transaction
            .select()
            .from(contentDna)
            .where(eq(contentDna.workspaceId, validatedWorkspaceId))
            .for("update");

          if (!container) {
            if (validatedBaseVersionId !== null) {
              throw conflict();
            }

            const contentDnaId = randomUUID();
            const versionId = randomUUID();

            await transaction.insert(contentDna).values({
              id: contentDnaId,
              workspaceId: validatedWorkspaceId,
              currentVersionId: versionId,
            });

            const [version] = await transaction
              .insert(contentDnaVersions)
              .values({
                id: versionId,
                contentDnaId,
                versionNumber: 1,
                payload: normalizedPayload,
                createdByUserId: userId,
              })
              .returning();

            if (!version) {
              throw new ApplicationError("INTERNAL_ERROR", "Content DNA version creation did not return a version.");
            }

            return toVersionDto(version, true);
          }

          if (container.currentVersionId !== validatedBaseVersionId) {
            throw conflict();
          }

          const [currentVersion] = await transaction
            .select()
            .from(contentDnaVersions)
            .where(and(eq(contentDnaVersions.id, container.currentVersionId), eq(contentDnaVersions.contentDnaId, container.id)));

          if (!currentVersion) {
            throw new ApplicationError("INTERNAL_ERROR", "Content DNA current-version state is unavailable.");
          }

          const normalizedCurrentPayload = parseContentDnaPayload(currentVersion.payload);

          if (areEquivalentPayloads(normalizedPayload, normalizedCurrentPayload)) {
            return toVersionDto(currentVersion, true);
          }

          const [version] = await transaction
            .insert(contentDnaVersions)
            .values({
              id: randomUUID(),
              contentDnaId: container.id,
              versionNumber: currentVersion.versionNumber + 1,
              payload: normalizedPayload,
              createdByUserId: userId,
            })
            .returning();

          if (!version) {
            throw new ApplicationError("INTERNAL_ERROR", "Content DNA version creation did not return a version.");
          }

          await transaction
            .update(contentDna)
            .set({ currentVersionId: version.id, updatedAt: new Date() })
            .where(eq(contentDna.id, container.id));

          return toVersionDto(version, true);
        });

        serviceLogger.info("dna.save.succeeded", {
          userId,
          workspaceId: validatedWorkspaceId,
          module: "dna",
          operation: "saveContentDna",
        });

        return saved;
      } catch (error) {
        serviceLogger.warn("dna.save.failed", {
          userId,
          workspaceId: validatedWorkspaceId,
          module: "dna",
          operation: "saveContentDna",
          errorCode: error instanceof ApplicationError ? error.code : "INTERNAL_ERROR",
        });

        throw error;
      }
    },
  };
}

const contentDnaApplicationService = createContentDnaApplicationService();

export const getCurrentContentDna = contentDnaApplicationService.getCurrentContentDna;
export const listContentDnaVersions = contentDnaApplicationService.listContentDnaVersions;
export const getContentDnaVersion = contentDnaApplicationService.getContentDnaVersion;
export const saveContentDna = contentDnaApplicationService.saveContentDna;
