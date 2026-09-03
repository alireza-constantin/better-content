import { desc, relations, sql } from "drizzle-orm";
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
  CanonicalIdeaGenerationOutput,
  GenerationLanguage,
} from "@/modules/ideas/domain/idea-generation-contracts";
import type { GenerationSettings, ProviderNeutralUsage } from "@/modules/ai/domain/ai-contracts";

import { contentDnaVersions } from "./content-dna";
import { workspaces } from "./workspace";

function aiRunIdentityColumns(): [AnyPgColumn, AnyPgColumn] {
  return [aiRuns.workspaceId, aiRuns.id];
}

function batchIdentityColumns(): [AnyPgColumn, AnyPgColumn] {
  return [ideaGenerationBatches.workspaceId, ideaGenerationBatches.id];
}

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    generationSettings: jsonb("generation_settings").$type<GenerationSettings>().notNull(),
    status: text("status").notNull(),
    errorCategory: text("error_category"),
    outputSnapshot: jsonb("output_snapshot").$type<CanonicalIdeaGenerationOutput>(),
    usage: jsonb("usage").$type<ProviderNeutralUsage>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (table) => [
    check("ai_runs_kind_check", sql`${table.kind} = 'IDEA_GENERATION'`),
    // Keep the prior provider/model pair valid for historical runs while the
    // application writes only the ADR-015 AvalAI/Luna pair going forward.
    check(
      "ai_runs_provider_check",
      sql`(${table.provider} = 'avalai' AND ${table.model} = 'gpt-5.6-luna') OR (${table.provider} = 'openai' AND ${table.model} = 'gpt-5.6-terra')`,
    ),
    check(
      "ai_runs_model_check",
      sql`(${table.provider} = 'avalai' AND ${table.model} = 'gpt-5.6-luna') OR (${table.provider} = 'openai' AND ${table.model} = 'gpt-5.6-terra')`,
    ),
    check("ai_runs_prompt_version_check", sql`${table.promptVersion} = 'idea-generation/v1'`),
    check(
      "ai_runs_status_check",
      sql`${table.status} IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')`,
    ),
    check(
      "ai_runs_error_category_check",
      sql`${table.errorCategory} IS NULL OR ${table.errorCategory} IN ('TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INVALID_OUTPUT', 'INTERRUPTED', 'UNKNOWN')`,
    ),
    check(
      "ai_runs_output_snapshot_status_check",
      sql`${table.status} = 'COMPLETED' OR ${table.outputSnapshot} IS NULL`,
    ),
    check(
      "ai_runs_error_category_status_check",
      sql`${table.status} = 'FAILED' OR ${table.errorCategory} IS NULL`,
    ),
    check(
      "ai_runs_lifecycle_timestamps_check",
      sql`(
        (${table.status} = 'PENDING' AND ${table.startedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NULL)
        OR (${table.status} = 'RUNNING' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NULL)
        OR (${table.status} = 'COMPLETED' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.failedAt} IS NULL)
        OR (${table.status} = 'FAILED' AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NOT NULL)
      )`,
    ),
    check(
      "ai_runs_timestamp_order_check",
      sql`(
        ${table.startedAt} IS NULL OR ${table.startedAt} >= ${table.createdAt}
      ) AND (
        ${table.completedAt} IS NULL OR ${table.completedAt} >= COALESCE(${table.startedAt}, ${table.createdAt})
      ) AND (
        ${table.failedAt} IS NULL OR ${table.failedAt} >= COALESCE(${table.startedAt}, ${table.createdAt})
      )`,
    ),
    // id is already the primary key, but this candidate key is required by
    // the batch composite FK so PostgreSQL can enforce same-workspace pairing.
    unique("ai_runs_workspace_id_id_candidate_key").on(table.workspaceId, table.id),
  ],
);

export const ideaGenerationBatches = pgTable(
  "idea_generation_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    contentDnaVersionId: uuid("content_dna_version_id")
      .notNull()
      .references(() => contentDnaVersions.id),
    aiRunId: uuid("ai_run_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    requestedLanguage: text("requested_language").$type<GenerationLanguage>().notNull(),
    requestedCount: integer("requested_count").notNull(),
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
      name: "idea_generation_batches_workspace_ai_run_fk",
    }),
    unique("idea_generation_batches_ai_run_id_unique").on(table.aiRunId),
    unique("idea_generation_batches_workspace_id_id_candidate_key").on(table.workspaceId, table.id),
    unique("idea_generation_batches_workspace_id_idempotency_key_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    check(
      "idea_generation_batches_requested_language_check",
      sql`${table.requestedLanguage} IN ('en', 'fa')`,
    ),
    check("idea_generation_batches_requested_count_check", sql`${table.requestedCount} = 20`),
    check(
      "idea_generation_batches_request_fingerprint_check",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "idea_generation_batches_status_check",
      sql`${table.status} IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')`,
    ),
    check(
      "idea_generation_batches_error_category_check",
      sql`${table.errorCategory} IS NULL OR ${table.errorCategory} IN ('TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INVALID_OUTPUT', 'INTERRUPTED', 'UNKNOWN')`,
    ),
    check(
      "idea_generation_batches_error_category_status_check",
      sql`${table.status} = 'FAILED' OR ${table.errorCategory} IS NULL`,
    ),
    check(
      "idea_generation_batches_lifecycle_timestamps_check",
      sql`(
        (${table.status} = 'PENDING' AND ${table.startedAt} IS NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NULL)
        OR (${table.status} = 'RUNNING' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NULL)
        OR (${table.status} = 'COMPLETED' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.failedAt} IS NULL)
        OR (${table.status} = 'FAILED' AND ${table.completedAt} IS NULL AND ${table.failedAt} IS NOT NULL)
      )`,
    ),
    check(
      "idea_generation_batches_timestamp_order_check",
      sql`(
        ${table.startedAt} IS NULL OR ${table.startedAt} >= ${table.createdAt}
      ) AND (
        ${table.completedAt} IS NULL OR ${table.completedAt} >= COALESCE(${table.startedAt}, ${table.createdAt})
      ) AND (
        ${table.failedAt} IS NULL OR ${table.failedAt} >= COALESCE(${table.startedAt}, ${table.createdAt})
      )`,
    ),
    index("idea_generation_batches_workspace_created_at_idx").on(
      table.workspaceId,
      desc(table.createdAt),
    ),
  ],
);

export const ideas = pgTable(
  "ideas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => ideaGenerationBatches.id),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category"),
    language: text("language").$type<GenerationLanguage>().notNull(),
    status: text("status").notNull().default("NEW"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).defaultNow().notNull(),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // PostgreSQL trigger SQL in the reviewed migration protects these
    // generated facts; decision fields remain intentionally mutable.
    unique("ideas_batch_id_position_unique").on(table.batchId, table.position),
    check("ideas_position_check", sql`${table.position} BETWEEN 1 AND 20`),
    check("ideas_language_check", sql`${table.language} IN ('en', 'fa')`),
    check("ideas_status_check", sql`${table.status} IN ('NEW', 'SAVED', 'ACCEPTED', 'REJECTED')`),
    check(
      "ideas_title_length_check",
      sql`char_length(${table.title}) BETWEEN 1 AND 120 AND ${table.title} !~ E'[\\r\\n]'`,
    ),
    check(
      "ideas_description_length_check",
      sql`char_length(${table.description}) BETWEEN 1 AND 500`,
    ),
    check(
      "ideas_category_check",
      sql`${table.category} IS NULL OR (char_length(${table.category}) BETWEEN 1 AND 80 AND ${table.category} !~ E'[\\r\\n]')`,
    ),
    check(
      "ideas_rejection_reason_check",
      sql`${table.rejectionReason} IS NULL OR char_length(${table.rejectionReason}) BETWEEN 1 AND 500`,
    ),
  ],
);

export const workspaceGenerationQuotaReservations = pgTable(
  "workspace_generation_quota_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    batchId: uuid("batch_id").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(),
    invokedAt: timestamp("invoked_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.batchId],
      foreignColumns: batchIdentityColumns(),
      name: "workspace_generation_quota_reservations_workspace_batch_fk",
    }),
    unique("workspace_generation_quota_reservations_batch_id_unique").on(table.batchId),
    check(
      "workspace_generation_quota_reservations_invocation_release_check",
      sql`${table.invokedAt} IS NULL OR ${table.releasedAt} IS NULL`,
    ),
    check(
      "workspace_generation_quota_reservations_timestamp_order_check",
      sql`(
        ${table.invokedAt} IS NULL OR ${table.invokedAt} >= ${table.reservedAt}
      ) AND (
        ${table.releasedAt} IS NULL OR ${table.releasedAt} >= ${table.reservedAt}
      )`,
    ),
    index("workspace_generation_quota_reservations_workspace_reserved_at_idx").on(
      table.workspaceId,
      table.reservedAt,
    ),
    index("workspace_generation_quota_reservations_workspace_invoked_at_idx").on(
      table.workspaceId,
      table.invokedAt,
    ),
  ],
);

export const aiRunsRelations = relations(aiRuns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [aiRuns.workspaceId],
    references: [workspaces.id],
  }),
  batch: one(ideaGenerationBatches, {
    fields: [aiRuns.id],
    references: [ideaGenerationBatches.aiRunId],
  }),
}));

export const ideaGenerationBatchesRelations = relations(ideaGenerationBatches, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [ideaGenerationBatches.workspaceId],
    references: [workspaces.id],
  }),
  contentDnaVersion: one(contentDnaVersions, {
    fields: [ideaGenerationBatches.contentDnaVersionId],
    references: [contentDnaVersions.id],
  }),
  aiRun: one(aiRuns, {
    fields: [ideaGenerationBatches.aiRunId],
    references: [aiRuns.id],
  }),
  ideas: many(ideas),
  quotaReservation: one(workspaceGenerationQuotaReservations, {
    fields: [ideaGenerationBatches.id],
    references: [workspaceGenerationQuotaReservations.batchId],
  }),
}));

export const ideasRelations = relations(ideas, ({ one }) => ({
  batch: one(ideaGenerationBatches, {
    fields: [ideas.batchId],
    references: [ideaGenerationBatches.id],
  }),
}));

export const workspaceGenerationQuotaReservationsRelations = relations(
  workspaceGenerationQuotaReservations,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceGenerationQuotaReservations.workspaceId],
      references: [workspaces.id],
    }),
    batch: one(ideaGenerationBatches, {
      fields: [workspaceGenerationQuotaReservations.batchId],
      references: [ideaGenerationBatches.id],
    }),
  }),
);

export type AiRun = typeof aiRuns.$inferSelect;
export type NewAiRun = typeof aiRuns.$inferInsert;
export type IdeaGenerationBatch = typeof ideaGenerationBatches.$inferSelect;
export type NewIdeaGenerationBatch = typeof ideaGenerationBatches.$inferInsert;
export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type WorkspaceGenerationQuotaReservation =
  typeof workspaceGenerationQuotaReservations.$inferSelect;
export type NewWorkspaceGenerationQuotaReservation =
  typeof workspaceGenerationQuotaReservations.$inferInsert;
