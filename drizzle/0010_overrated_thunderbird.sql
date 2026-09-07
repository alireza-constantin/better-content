CREATE TABLE "asset_references" (
	"workspace_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"artifact_kind" text NOT NULL,
	"version_id" uuid,
	"direction_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_references_artifact_direction_unique" UNIQUE NULLS NOT DISTINCT ("content_id","artifact_kind","version_id","direction_id"),
	CONSTRAINT "asset_references_artifact_kind_check" CHECK ("asset_references"."artifact_kind" IN ('DRAFT', 'VERSION')),
	CONSTRAINT "asset_references_artifact_shape_check" CHECK (("asset_references"."artifact_kind" = 'DRAFT' AND "asset_references"."version_id" IS NULL) OR ("asset_references"."artifact_kind" = 'VERSION' AND "asset_references"."version_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"media_type" text NOT NULL,
	"source_type" text NOT NULL,
	"status" text NOT NULL,
	"display_name" text NOT NULL,
	"original_filename" text,
	"declared_byte_size" integer,
	"declared_mime_type" text,
	"source_url" text,
	"source_host" text,
	"staging_key" text,
	"permanent_key" text,
	"byte_size" integer,
	"detected_mime_type" text,
	"media_format" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"codecs" text,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_workspace_id_id_candidate_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "assets_permanent_key_unique" UNIQUE("permanent_key"),
	CONSTRAINT "assets_media_type_check" CHECK ("assets"."media_type" IN ('IMAGE', 'VIDEO', 'AUDIO')),
	CONSTRAINT "assets_source_type_check" CHECK ("assets"."source_type" IN ('UPLOAD', 'EXTERNAL_URL')),
	CONSTRAINT "assets_status_check" CHECK ("assets"."status" IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETING')),
	CONSTRAINT "assets_source_metadata_check" CHECK ((
    "assets"."source_type" = 'UPLOAD' AND "assets"."original_filename" IS NOT NULL AND "assets"."source_url" IS NULL AND "assets"."source_host" IS NULL
  ) OR (
    "assets"."source_type" = 'EXTERNAL_URL' AND "assets"."original_filename" IS NULL AND "assets"."source_url" IS NOT NULL AND "assets"."source_host" IS NOT NULL
  )),
	CONSTRAINT "assets_ready_metadata_check" CHECK ("assets"."status" <> 'READY' OR (
    "assets"."permanent_key" IS NOT NULL AND "assets"."byte_size" IS NOT NULL AND "assets"."detected_mime_type" IS NOT NULL AND "assets"."media_format" IS NOT NULL
  )),
	CONSTRAINT "assets_failure_code_check" CHECK ("assets"."status" = 'FAILED' OR "assets"."failure_code" IS NULL),
	CONSTRAINT "assets_positive_metadata_check" CHECK (("assets"."declared_byte_size" IS NULL OR "assets"."declared_byte_size" > 0) AND ("assets"."byte_size" IS NULL OR "assets"."byte_size" > 0) AND ("assets"."width" IS NULL OR "assets"."width" > 0) AND ("assets"."height" IS NULL OR "assets"."height" > 0) AND ("assets"."duration_ms" IS NULL OR "assets"."duration_ms" >= 0))
);
--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_workspace_asset_fk" FOREIGN KEY ("workspace_id","asset_id") REFERENCES "public"."assets"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_workspace_id_id_candidate_key" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_workspace_content_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."contents"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_content_version_fk" FOREIGN KEY ("content_id","version_id") REFERENCES "public"."content_versions"("content_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_references_asset_id_idx" ON "asset_references" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assets_workspace_status_created_at_idx" ON "assets" USING btree ("workspace_id","status","created_at");
