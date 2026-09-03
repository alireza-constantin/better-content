import { relations, sql } from "drizzle-orm";
import {
  check,
  type AnyPgColumn,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  ContentScriptDocument,
  ContentScriptFormat,
} from "@/modules/content/domain/content-script-contracts";
import type { GenerationLanguage } from "@/modules/ideas/domain/idea-generation-contracts";

import { user } from "./auth";
import { contentDnaVersions } from "./content-dna";
import { aiRuns, ideas } from "./idea-generation";
import { workspaces } from "./workspace";

function aiRunIdentityColumns(): [AnyPgColumn, AnyPgColumn] {
  return [aiRuns.workspaceId, aiRuns.id];
}

function attemptIdentityColumns(): [AnyPgColumn, AnyPgColumn] {
  return [contentGenerationAttempts.workspaceId, contentGenerationAttempts.id];
}

export const contentGenerationAttempts = pgTable(
  "content_generation_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sourceIdeaId: uuid("source_idea_id")
      .notNull()
      .references(() => ideas.id),
    contentDnaVersionId: uuid("content_dna_version_id")
      .notNull()
      .references(() => contentDnaVersions.id),
    requestedLanguage: text("requested_language").$type<GenerationLanguage>().notNull(),
    format: text("format").$type<ContentScriptFormat>().notNull(),
    instructions: text("instructions"),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    aiRunId: uuid("ai_run_id").notNull(),
    status: text("status").notNull(),
    errorCategory: text("error_category"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.aiRunId],
      foreignColumns: aiRunIdentityColumns(),
      name: "content_generation_attempts_workspace_ai_run_fk",
    }),
    unique("content_generation_attempts_ai_run_id_unique").on(table.aiRunId),
    unique("content_generation_attempts_workspace_id_id_candidate_key").on(
      table.workspaceId,
      table.id,
    ),
    unique("content_generation_attempts_workspace_id_idempotency_key_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    check(
      "content_generation_attempts_requested_language_check",
      sql`${table.requestedLanguage} IN ('en', 'fa')`,
    ),
    check(
      "content_generation_attempts_format_check",
      sql`${table.format} IN ('SHORT_VIDEO', 'LONG_VIDEO')`,
    ),
    check(
      "content_generation_attempts_instructions_check",
      sql`${table.instructions} IS NULL OR char_length(${table.instructions}) BETWEEN 1 AND 1000`,
    ),
    check(
      "content_generation_attempts_request_fingerprint_check",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "content_generation_attempts_status_check",
      sql`${table.status} IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')`,
    ),
    check(
      "content_generation_attempts_error_category_check",
      sql`${table.errorCategory} IS NULL OR ${table.errorCategory} IN ('TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INVALID_OUTPUT', 'INTERRUPTED', 'UNKNOWN')`,
    ),
    check(
      "content_generation_attempts_lifecycle_check",
      sql`(
        ${table.status} = 'PENDING'
        AND ${table.errorCategory} IS NULL
        AND ${table.startedAt} IS NULL
        AND ${table.completedAt} IS NULL
        AND ${table.failedAt} IS NULL
      ) OR (
        ${table.status} = 'RUNNING'
        AND ${table.errorCategory} IS NULL
        AND ${table.startedAt} IS NOT NULL
        AND ${table.completedAt} IS NULL
        AND ${table.failedAt} IS NULL
      ) OR (
        ${table.status} = 'COMPLETED'
        AND ${table.errorCategory} IS NULL
        AND ${table.startedAt} IS NOT NULL
        AND ${table.completedAt} IS NOT NULL
        AND ${table.failedAt} IS NULL
      ) OR (
        ${table.status} = 'FAILED'
        AND ${table.errorCategory} IS NOT NULL
        AND ${table.completedAt} IS NULL
        AND ${table.failedAt} IS NOT NULL
      )`,
    ),
    check(
      "content_generation_attempts_timestamp_order_check",
      sql`(
        ${table.startedAt} IS NULL OR ${table.startedAt} >= ${table.createdAt}
      ) AND (
        ${table.completedAt} IS NULL OR ${table.completedAt} >= COALESCE(${table.startedAt}, ${table.createdAt})
      ) AND (
        ${table.failedAt} IS NULL OR ${table.failedAt} >= COALESCE(${table.startedAt}, ${table.createdAt})
      )`,
    ),
    index("content_generation_attempts_source_idea_id_created_at_idx").on(
      table.sourceIdeaId,
      table.createdAt,
    ),
    index("content_generation_attempts_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const contents = pgTable(
  "contents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sourceIdeaId: uuid("source_idea_id")
      .notNull()
      .references(() => ideas.id),
    contentLanguage: text("content_language").$type<GenerationLanguage>().notNull(),
    format: text("format").$type<ContentScriptFormat>().notNull(),
    sourceGenerationAttemptId: uuid("source_generation_attempt_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.sourceGenerationAttemptId],
      foreignColumns: attemptIdentityColumns(),
      name: "contents_workspace_source_generation_attempt_fk",
    }),
    unique("contents_source_generation_attempt_id_unique").on(table.sourceGenerationAttemptId),
    check("contents_language_check", sql`${table.contentLanguage} IN ('en', 'fa')`),
    check("contents_format_check", sql`${table.format} IN ('SHORT_VIDEO', 'LONG_VIDEO')`),
    index("contents_workspace_id_idx").on(table.workspaceId),
    index("contents_source_idea_id_idx").on(table.sourceIdeaId),
  ],
);

export const contentDrafts = pgTable(
  "content_drafts",
  {
    contentId: uuid("content_id")
      .primaryKey()
      .references(() => contents.id),
    document: jsonb("document").$type<ContentScriptDocument>().notNull(),
    revision: integer("revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("content_drafts_revision_positive_check", sql`${table.revision} > 0`),
    index("content_drafts_updated_at_idx").on(table.updatedAt),
  ],
);

export const contentVersions = pgTable(
  "content_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contents.id),
    versionNumber: integer("version_number").notNull(),
    document: jsonb("document").$type<ContentScriptDocument>().notNull(),
    source: text("source").notNull(),
    aiRunId: uuid("ai_run_id")
      .notNull()
      .references(() => aiRuns.id),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("content_versions_content_id_version_number_unique").on(
      table.contentId,
      table.versionNumber,
    ),
    unique("content_versions_ai_run_id_unique").on(table.aiRunId),
    check("content_versions_version_number_positive_check", sql`${table.versionNumber} > 0`),
    check("content_versions_source_check", sql`${table.source} = 'AI_GENERATED'`),
  ],
);

export const workspaceContentGenerationQuotaReservations = pgTable(
  "workspace_content_generation_quota_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    attemptId: uuid("attempt_id").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(),
    invokedAt: timestamp("invoked_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.attemptId],
      foreignColumns: attemptIdentityColumns(),
      name: "workspace_content_generation_quota_reservations_workspace_attempt_fk",
    }),
    unique("workspace_content_generation_quota_reservations_attempt_id_unique").on(table.attemptId),
    check(
      "workspace_content_generation_quota_reservations_invocation_release_check",
      sql`${table.invokedAt} IS NULL OR ${table.releasedAt} IS NULL`,
    ),
    check(
      "workspace_content_generation_quota_reservations_timestamp_order_check",
      sql`(
        ${table.invokedAt} IS NULL OR ${table.invokedAt} >= ${table.reservedAt}
      ) AND (
        ${table.releasedAt} IS NULL OR ${table.releasedAt} >= ${table.reservedAt}
      )`,
    ),
    index("workspace_content_generation_quota_reservations_workspace_reserved_at_idx").on(
      table.workspaceId,
      table.reservedAt,
    ),
    index("workspace_content_generation_quota_reservations_workspace_invoked_at_idx").on(
      table.workspaceId,
      table.invokedAt,
    ),
  ],
);

export const contentGenerationAttemptsRelations = relations(
  contentGenerationAttempts,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [contentGenerationAttempts.workspaceId],
      references: [workspaces.id],
    }),
    sourceIdea: one(ideas, {
      fields: [contentGenerationAttempts.sourceIdeaId],
      references: [ideas.id],
    }),
    contentDnaVersion: one(contentDnaVersions, {
      fields: [contentGenerationAttempts.contentDnaVersionId],
      references: [contentDnaVersions.id],
    }),
    aiRun: one(aiRuns, {
      fields: [contentGenerationAttempts.aiRunId],
      references: [aiRuns.id],
    }),
  }),
);

export const contentsRelations = relations(contents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [contents.workspaceId],
    references: [workspaces.id],
  }),
  sourceIdea: one(ideas, {
    fields: [contents.sourceIdeaId],
    references: [ideas.id],
  }),
  sourceGenerationAttempt: one(contentGenerationAttempts, {
    fields: [contents.sourceGenerationAttemptId],
    references: [contentGenerationAttempts.id],
  }),
  draft: one(contentDrafts, {
    fields: [contents.id],
    references: [contentDrafts.contentId],
  }),
  versions: many(contentVersions),
}));

export const contentDraftsRelations = relations(contentDrafts, ({ one }) => ({
  content: one(contents, {
    fields: [contentDrafts.contentId],
    references: [contents.id],
  }),
}));

export const contentVersionsRelations = relations(contentVersions, ({ one }) => ({
  content: one(contents, {
    fields: [contentVersions.contentId],
    references: [contents.id],
  }),
  aiRun: one(aiRuns, {
    fields: [contentVersions.aiRunId],
    references: [aiRuns.id],
  }),
  createdByUser: one(user, {
    fields: [contentVersions.createdByUserId],
    references: [user.id],
  }),
}));

export const workspaceContentGenerationQuotaReservationsRelations = relations(
  workspaceContentGenerationQuotaReservations,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceContentGenerationQuotaReservations.workspaceId],
      references: [workspaces.id],
    }),
    attempt: one(contentGenerationAttempts, {
      fields: [workspaceContentGenerationQuotaReservations.attemptId],
      references: [contentGenerationAttempts.id],
    }),
  }),
);

export type ContentGenerationAttempt = typeof contentGenerationAttempts.$inferSelect;
export type NewContentGenerationAttempt = typeof contentGenerationAttempts.$inferInsert;
export type Content = typeof contents.$inferSelect;
export type NewContent = typeof contents.$inferInsert;
export type ContentDraft = typeof contentDrafts.$inferSelect;
export type NewContentDraft = typeof contentDrafts.$inferInsert;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type NewContentVersion = typeof contentVersions.$inferInsert;
export type WorkspaceContentGenerationQuotaReservation =
  typeof workspaceContentGenerationQuotaReservations.$inferSelect;
export type NewWorkspaceContentGenerationQuotaReservation =
  typeof workspaceContentGenerationQuotaReservations.$inferInsert;
