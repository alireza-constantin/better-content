import { relations, sql } from "drizzle-orm";
import {
  check,
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

import { user } from "./auth";
import { contents, contentVersions } from "./content-generation";
import { workspaces } from "./workspace";

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    mediaType: text("media_type").notNull(),
    sourceType: text("source_type").notNull(),
    status: text("status").notNull(),
    displayName: text("display_name").notNull(),
    originalFilename: text("original_filename"),
    declaredByteSize: integer("declared_byte_size"),
    declaredMimeType: text("declared_mime_type"),
    sourceUrl: text("source_url"),
    sourceHost: text("source_host"),
    stagingKey: text("staging_key"),
    permanentKey: text("permanent_key"),
    byteSize: integer("byte_size"),
    detectedMimeType: text("detected_mime_type"),
    mediaFormat: text("media_format"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    codecs: text("codecs"),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("assets_workspace_id_id_candidate_key").on(table.workspaceId, table.id),
    unique("assets_permanent_key_unique").on(table.permanentKey),
    check("assets_media_type_check", sql`${table.mediaType} IN ('IMAGE', 'VIDEO', 'AUDIO')`),
    check("assets_source_type_check", sql`${table.sourceType} IN ('UPLOAD', 'EXTERNAL_URL')`),
    check(
      "assets_status_check",
      sql`${table.status} IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETING')`,
    ),
    check(
      "assets_source_metadata_check",
      sql`(
    ${table.sourceType} = 'UPLOAD' AND ${table.originalFilename} IS NOT NULL AND ${table.sourceUrl} IS NULL AND ${table.sourceHost} IS NULL
  ) OR (
    ${table.sourceType} = 'EXTERNAL_URL' AND ${table.originalFilename} IS NULL AND ${table.sourceUrl} IS NOT NULL AND ${table.sourceHost} IS NOT NULL
  )`,
    ),
    check(
      "assets_ready_metadata_check",
      sql`${table.status} <> 'READY' OR (
    ${table.permanentKey} IS NOT NULL AND ${table.byteSize} IS NOT NULL AND ${table.detectedMimeType} IS NOT NULL AND ${table.mediaFormat} IS NOT NULL
  )`,
    ),
    check(
      "assets_failure_code_check",
      sql`${table.status} = 'FAILED' OR ${table.failureCode} IS NULL`,
    ),
    check(
      "assets_failure_code_value_check",
      sql`${table.failureCode} IS NULL OR ${table.failureCode} IN ('UPLOAD_EXPIRED', 'MEDIA_TOO_LARGE', 'MEDIA_LIMIT_EXCEEDED', 'MEDIA_TYPE_MISMATCH', 'UNSUPPORTED_MEDIA', 'INVALID_MEDIA', 'UNSAFE_MEDIA_URL', 'MEDIA_SOURCE_UNAVAILABLE', 'PROCESSING_UNAVAILABLE')`,
    ),
    check(
      "assets_positive_metadata_check",
      sql`(${table.declaredByteSize} IS NULL OR ${table.declaredByteSize} > 0) AND (${table.byteSize} IS NULL OR ${table.byteSize} > 0) AND (${table.width} IS NULL OR ${table.width} > 0) AND (${table.height} IS NULL OR ${table.height} > 0) AND (${table.durationMs} IS NULL OR ${table.durationMs} >= 0)`,
    ),
    index("assets_workspace_status_created_at_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
  ],
);

/** Accepted Asset creation events remain quota evidence after Asset cleanup. */
export const assetAdmissionEvents = pgTable(
  "asset_admission_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("asset_admission_events_user_created_at_idx").on(table.userId, table.createdAt),
    index("asset_admission_events_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
  ],
);

/**
 * Durable, provider-neutral work ownership for the Asset module. Payloads are
 * deliberately restricted by the application boundary to a stable Asset ID.
 */
export const assetJobs = pgTable(
  "asset_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("PENDING"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("asset_jobs_dedupe_key_unique").on(table.dedupeKey),
    index("asset_jobs_due_idx").on(table.status, table.scheduledAt),
    index("asset_jobs_lease_expiry_idx").on(table.status, table.leaseExpiresAt),
    check(
      "asset_jobs_type_check",
      sql`${table.type} IN ('PROCESS_UPLOAD', 'INGEST_EXTERNAL_URL', 'DELETE_ASSET', 'EXPIRE_UPLOAD', 'RECONCILE_STORAGE')`,
    ),
    check(
      "asset_jobs_status_check",
      sql`${table.status} IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')`,
    ),
    check(
      "asset_jobs_attempts_check",
      sql`${table.attempts} >= 0 AND ${table.maxAttempts} BETWEEN 1 AND 5 AND ${table.attempts} <= ${table.maxAttempts}`,
    ),
    check(
      "asset_jobs_payload_check",
      sql`jsonb_typeof(${table.payload}) = 'object' AND ${table.payload} ? 'assetId' AND jsonb_typeof(${table.payload}->'assetId') = 'string' AND ${table.payload} = jsonb_build_object('assetId', ${table.payload}->'assetId')`,
    ),
    check(
      "asset_jobs_failure_code_value_check",
      sql`${table.failureCode} IS NULL OR ${table.failureCode} IN ('UPLOAD_EXPIRED', 'MEDIA_TOO_LARGE', 'MEDIA_LIMIT_EXCEEDED', 'MEDIA_TYPE_MISMATCH', 'UNSUPPORTED_MEDIA', 'INVALID_MEDIA', 'UNSAFE_MEDIA_URL', 'MEDIA_SOURCE_UNAVAILABLE', 'PROCESSING_UNAVAILABLE')`,
    ),
    check(
      "asset_jobs_running_lease_check",
      sql`(${table.status} = 'RUNNING') = (${table.leaseOwner} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
    check(
      "asset_jobs_terminal_timestamp_check",
      sql`(${table.status} = 'COMPLETED') = (${table.completedAt} IS NOT NULL) AND (${table.status} = 'FAILED') = (${table.failedAt} IS NOT NULL)`,
    ),
  ],
);

export const assetReferences = pgTable(
  "asset_references",
  {
    workspaceId: uuid("workspace_id").notNull(),
    assetId: uuid("asset_id").notNull(),
    contentId: uuid("content_id").notNull(),
    artifactKind: text("artifact_kind").notNull(),
    versionId: uuid("version_id"),
    directionId: uuid("direction_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.assetId],
      foreignColumns: [assets.workspaceId, assets.id],
      name: "asset_references_workspace_asset_fk",
    }),
    foreignKey({
      columns: [table.workspaceId, table.contentId],
      foreignColumns: [contents.workspaceId, contents.id],
      name: "asset_references_workspace_content_fk",
    }),
    foreignKey({
      columns: [table.contentId, table.versionId],
      foreignColumns: [contentVersions.contentId, contentVersions.id],
      name: "asset_references_content_version_fk",
    }),
    check(
      "asset_references_artifact_kind_check",
      sql`${table.artifactKind} IN ('DRAFT', 'VERSION')`,
    ),
    check(
      "asset_references_artifact_shape_check",
      sql`(${table.artifactKind} = 'DRAFT' AND ${table.versionId} IS NULL) OR (${table.artifactKind} = 'VERSION' AND ${table.versionId} IS NOT NULL)`,
    ),
    unique("asset_references_artifact_direction_unique").on(
      table.contentId,
      table.artifactKind,
      table.versionId,
      table.directionId,
    ),
    index("asset_references_asset_id_idx").on(table.assetId),
  ],
);

export const assetsRelations = relations(assets, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [assets.workspaceId], references: [workspaces.id] }),
  createdByUser: one(user, { fields: [assets.createdByUserId], references: [user.id] }),
  references: many(assetReferences),
}));
export const assetReferencesRelations = relations(assetReferences, ({ one }) => ({
  asset: one(assets, { fields: [assetReferences.assetId], references: [assets.id] }),
  content: one(contents, { fields: [assetReferences.contentId], references: [contents.id] }),
  version: one(contentVersions, {
    fields: [assetReferences.versionId],
    references: [contentVersions.id],
  }),
}));
export type Asset = typeof assets.$inferSelect;
export type AssetReference = typeof assetReferences.$inferSelect;
export type AssetJob = typeof assetJobs.$inferSelect;
