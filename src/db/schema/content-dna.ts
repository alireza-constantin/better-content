import { sql } from "drizzle-orm";
import {
  check,
  type AnyPgColumn,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { ContentDnaPayload } from "@/modules/dna/domain/content-dna-payload";

import { user } from "./auth";
import { workspaces } from "./workspace";

function currentVersionForeignColumns(): [AnyPgColumn, AnyPgColumn] {
  return [contentDnaVersions.contentDnaId, contentDnaVersions.id];
}

export const contentDna = pgTable(
  "content_dna",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    currentVersionId: uuid("current_version_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("content_dna_workspace_id_unique").on(table.workspaceId),
    // Drizzle models the relationship, but does not expose PostgreSQL's
    // DEFERRABLE foreign-key option. The reviewed migration applies
    // DEFERRABLE INITIALLY DEFERRED to this constraint so first creation
    // can insert the container before its pre-generated version row. Any
    // migration that replaces this FK must restore those semantics.
    foreignKey({
      columns: [table.id, table.currentVersionId],
      foreignColumns: currentVersionForeignColumns(),
      name: "content_dna_current_version_same_container_fk",
    }),
  ],
);

export const contentDnaVersions = pgTable(
  "content_dna_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentDnaId: uuid("content_dna_id")
      .notNull()
      .references(() => contentDna.id),
    versionNumber: integer("version_number").notNull(),
    payload: jsonb("payload").$type<ContentDnaPayload>().notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("content_dna_versions_version_number_positive", sql`${table.versionNumber} > 0`),
    unique("content_dna_versions_content_dna_id_version_number_unique").on(
      table.contentDnaId,
      table.versionNumber,
    ),
    unique("content_dna_versions_content_dna_id_id_unique").on(table.contentDnaId, table.id),
  ],
);
