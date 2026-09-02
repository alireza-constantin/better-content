CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"generation_settings" jsonb NOT NULL,
	"status" text NOT NULL,
	"error_category" text,
	"output_snapshot" jsonb,
	"usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "ai_runs_workspace_id_id_candidate_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "ai_runs_kind_check" CHECK ("ai_runs"."kind" = 'IDEA_GENERATION'),
	CONSTRAINT "ai_runs_provider_check" CHECK ("ai_runs"."provider" = 'openai'),
	CONSTRAINT "ai_runs_model_check" CHECK ("ai_runs"."model" = 'gpt-5.6-terra'),
	CONSTRAINT "ai_runs_prompt_version_check" CHECK ("ai_runs"."prompt_version" = 'idea-generation/v1'),
	CONSTRAINT "ai_runs_status_check" CHECK ("ai_runs"."status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "ai_runs_error_category_check" CHECK ("ai_runs"."error_category" IS NULL OR "ai_runs"."error_category" IN ('TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INVALID_OUTPUT', 'INTERRUPTED', 'UNKNOWN')),
	CONSTRAINT "ai_runs_output_snapshot_status_check" CHECK ("ai_runs"."status" = 'COMPLETED' OR "ai_runs"."output_snapshot" IS NULL),
	CONSTRAINT "ai_runs_error_category_status_check" CHECK ("ai_runs"."status" = 'FAILED' OR "ai_runs"."error_category" IS NULL),
	CONSTRAINT "ai_runs_lifecycle_timestamps_check" CHECK ((
        ("ai_runs"."status" = 'PENDING' AND "ai_runs"."started_at" IS NULL AND "ai_runs"."completed_at" IS NULL AND "ai_runs"."failed_at" IS NULL)
        OR ("ai_runs"."status" = 'RUNNING' AND "ai_runs"."started_at" IS NOT NULL AND "ai_runs"."completed_at" IS NULL AND "ai_runs"."failed_at" IS NULL)
        OR ("ai_runs"."status" = 'COMPLETED' AND "ai_runs"."started_at" IS NOT NULL AND "ai_runs"."completed_at" IS NOT NULL AND "ai_runs"."failed_at" IS NULL)
        OR ("ai_runs"."status" = 'FAILED' AND "ai_runs"."completed_at" IS NULL AND "ai_runs"."failed_at" IS NOT NULL)
      )),
	CONSTRAINT "ai_runs_timestamp_order_check" CHECK ((
        "ai_runs"."started_at" IS NULL OR "ai_runs"."started_at" >= "ai_runs"."created_at"
      ) AND (
        "ai_runs"."completed_at" IS NULL OR "ai_runs"."completed_at" >= COALESCE("ai_runs"."started_at", "ai_runs"."created_at")
      ) AND (
        "ai_runs"."failed_at" IS NULL OR "ai_runs"."failed_at" >= COALESCE("ai_runs"."started_at", "ai_runs"."created_at")
      ))
);
--> statement-breakpoint
CREATE TABLE "idea_generation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_dna_version_id" uuid NOT NULL,
	"ai_run_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"requested_language" text NOT NULL,
	"requested_count" integer NOT NULL,
	"status" text NOT NULL,
	"error_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "idea_generation_batches_ai_run_id_unique" UNIQUE("ai_run_id"),
	CONSTRAINT "idea_generation_batches_workspace_id_id_candidate_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "idea_generation_batches_workspace_id_idempotency_key_unique" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "idea_generation_batches_requested_language_check" CHECK ("idea_generation_batches"."requested_language" IN ('en', 'fa')),
	CONSTRAINT "idea_generation_batches_requested_count_check" CHECK ("idea_generation_batches"."requested_count" = 20),
	CONSTRAINT "idea_generation_batches_request_fingerprint_check" CHECK ("idea_generation_batches"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "idea_generation_batches_status_check" CHECK ("idea_generation_batches"."status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "idea_generation_batches_error_category_check" CHECK ("idea_generation_batches"."error_category" IS NULL OR "idea_generation_batches"."error_category" IN ('TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INVALID_OUTPUT', 'INTERRUPTED', 'UNKNOWN')),
	CONSTRAINT "idea_generation_batches_error_category_status_check" CHECK ("idea_generation_batches"."status" = 'FAILED' OR "idea_generation_batches"."error_category" IS NULL),
	CONSTRAINT "idea_generation_batches_lifecycle_timestamps_check" CHECK ((
        ("idea_generation_batches"."status" = 'PENDING' AND "idea_generation_batches"."started_at" IS NULL AND "idea_generation_batches"."completed_at" IS NULL AND "idea_generation_batches"."failed_at" IS NULL)
        OR ("idea_generation_batches"."status" = 'RUNNING' AND "idea_generation_batches"."started_at" IS NOT NULL AND "idea_generation_batches"."completed_at" IS NULL AND "idea_generation_batches"."failed_at" IS NULL)
        OR ("idea_generation_batches"."status" = 'COMPLETED' AND "idea_generation_batches"."started_at" IS NOT NULL AND "idea_generation_batches"."completed_at" IS NOT NULL AND "idea_generation_batches"."failed_at" IS NULL)
        OR ("idea_generation_batches"."status" = 'FAILED' AND "idea_generation_batches"."completed_at" IS NULL AND "idea_generation_batches"."failed_at" IS NOT NULL)
      )),
	CONSTRAINT "idea_generation_batches_timestamp_order_check" CHECK ((
        "idea_generation_batches"."started_at" IS NULL OR "idea_generation_batches"."started_at" >= "idea_generation_batches"."created_at"
      ) AND (
        "idea_generation_batches"."completed_at" IS NULL OR "idea_generation_batches"."completed_at" >= COALESCE("idea_generation_batches"."started_at", "idea_generation_batches"."created_at")
      ) AND (
        "idea_generation_batches"."failed_at" IS NULL OR "idea_generation_batches"."failed_at" >= COALESCE("idea_generation_batches"."started_at", "idea_generation_batches"."created_at")
      ))
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"language" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ideas_batch_id_position_unique" UNIQUE("batch_id","position"),
	CONSTRAINT "ideas_position_check" CHECK ("ideas"."position" BETWEEN 1 AND 20),
	CONSTRAINT "ideas_language_check" CHECK ("ideas"."language" IN ('en', 'fa')),
	CONSTRAINT "ideas_status_check" CHECK ("ideas"."status" IN ('NEW', 'SAVED', 'ACCEPTED', 'REJECTED')),
	CONSTRAINT "ideas_title_length_check" CHECK (char_length("ideas"."title") BETWEEN 1 AND 120 AND "ideas"."title" !~ E'[\r\n]'),
	CONSTRAINT "ideas_description_length_check" CHECK (char_length("ideas"."description") BETWEEN 1 AND 500),
	CONSTRAINT "ideas_category_check" CHECK ("ideas"."category" IS NULL OR (char_length("ideas"."category") BETWEEN 1 AND 80 AND "ideas"."category" !~ E'[\r\n]')),
	CONSTRAINT "ideas_rejection_reason_check" CHECK ("ideas"."rejection_reason" IS NULL OR char_length("ideas"."rejection_reason") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "workspace_generation_quota_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoked_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	CONSTRAINT "workspace_generation_quota_reservations_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "workspace_generation_quota_reservations_invocation_release_check" CHECK ("workspace_generation_quota_reservations"."invoked_at" IS NULL OR "workspace_generation_quota_reservations"."released_at" IS NULL),
	CONSTRAINT "workspace_generation_quota_reservations_timestamp_order_check" CHECK ((
        "workspace_generation_quota_reservations"."invoked_at" IS NULL OR "workspace_generation_quota_reservations"."invoked_at" >= "workspace_generation_quota_reservations"."reserved_at"
      ) AND (
        "workspace_generation_quota_reservations"."released_at" IS NULL OR "workspace_generation_quota_reservations"."released_at" >= "workspace_generation_quota_reservations"."reserved_at"
      ))
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_generation_batches" ADD CONSTRAINT "idea_generation_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_generation_batches" ADD CONSTRAINT "idea_generation_batches_content_dna_version_id_content_dna_versions_id_fk" FOREIGN KEY ("content_dna_version_id") REFERENCES "public"."content_dna_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_generation_batches" ADD CONSTRAINT "idea_generation_batches_workspace_ai_run_fk" FOREIGN KEY ("workspace_id","ai_run_id") REFERENCES "public"."ai_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_batch_id_idea_generation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."idea_generation_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_generation_quota_reservations" ADD CONSTRAINT "workspace_generation_quota_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_generation_quota_reservations" ADD CONSTRAINT "workspace_generation_quota_reservations_workspace_batch_fk" FOREIGN KEY ("workspace_id","batch_id") REFERENCES "public"."idea_generation_batches"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idea_generation_batches_workspace_created_at_idx" ON "idea_generation_batches" USING btree ("workspace_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "workspace_generation_quota_reservations_workspace_reserved_at_idx" ON "workspace_generation_quota_reservations" USING btree ("workspace_id","reserved_at");--> statement-breakpoint
CREATE INDEX "workspace_generation_quota_reservations_workspace_invoked_at_idx" ON "workspace_generation_quota_reservations" USING btree ("workspace_id","invoked_at");
--> statement-breakpoint
CREATE FUNCTION "prevent_idea_generated_field_updates"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."batch_id" IS DISTINCT FROM NEW."batch_id"
    OR OLD."position" IS DISTINCT FROM NEW."position"
    OR OLD."title" IS DISTINCT FROM NEW."title"
    OR OLD."description" IS DISTINCT FROM NEW."description"
    OR OLD."category" IS DISTINCT FROM NEW."category"
    OR OLD."language" IS DISTINCT FROM NEW."language" THEN
    RAISE EXCEPTION 'ideas generated fields are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ideas_generated_fields_immutable"
BEFORE UPDATE ON "ideas"
FOR EACH ROW EXECUTE FUNCTION "prevent_idea_generated_field_updates"();
