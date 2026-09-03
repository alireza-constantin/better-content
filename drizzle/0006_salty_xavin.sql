CREATE TABLE "content_drafts" (
	"content_id" uuid PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_drafts_revision_positive_check" CHECK ("content_drafts"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "content_generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_idea_id" uuid NOT NULL,
	"content_dna_version_id" uuid NOT NULL,
	"requested_language" text NOT NULL,
	"format" text NOT NULL,
	"instructions" text,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"ai_run_id" uuid NOT NULL,
	"status" text NOT NULL,
	"error_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "content_generation_attempts_ai_run_id_unique" UNIQUE("ai_run_id"),
	CONSTRAINT "content_generation_attempts_workspace_id_id_candidate_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "content_generation_attempts_workspace_id_idempotency_key_unique" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "content_generation_attempts_requested_language_check" CHECK ("content_generation_attempts"."requested_language" IN ('en', 'fa')),
	CONSTRAINT "content_generation_attempts_format_check" CHECK ("content_generation_attempts"."format" IN ('SHORT_VIDEO', 'LONG_VIDEO')),
	CONSTRAINT "content_generation_attempts_instructions_check" CHECK ("content_generation_attempts"."instructions" IS NULL OR char_length("content_generation_attempts"."instructions") BETWEEN 1 AND 1000),
	CONSTRAINT "content_generation_attempts_request_fingerprint_check" CHECK ("content_generation_attempts"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "content_generation_attempts_status_check" CHECK ("content_generation_attempts"."status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "content_generation_attempts_error_category_check" CHECK ("content_generation_attempts"."error_category" IS NULL OR "content_generation_attempts"."error_category" IN ('TIMEOUT', 'RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'INVALID_OUTPUT', 'INTERRUPTED', 'UNKNOWN')),
	CONSTRAINT "content_generation_attempts_lifecycle_check" CHECK ((
        "content_generation_attempts"."status" = 'PENDING'
        AND "content_generation_attempts"."error_category" IS NULL
        AND "content_generation_attempts"."started_at" IS NULL
        AND "content_generation_attempts"."completed_at" IS NULL
        AND "content_generation_attempts"."failed_at" IS NULL
      ) OR (
        "content_generation_attempts"."status" = 'RUNNING'
        AND "content_generation_attempts"."error_category" IS NULL
        AND "content_generation_attempts"."started_at" IS NOT NULL
        AND "content_generation_attempts"."completed_at" IS NULL
        AND "content_generation_attempts"."failed_at" IS NULL
      ) OR (
        "content_generation_attempts"."status" = 'COMPLETED'
        AND "content_generation_attempts"."error_category" IS NULL
        AND "content_generation_attempts"."started_at" IS NOT NULL
        AND "content_generation_attempts"."completed_at" IS NOT NULL
        AND "content_generation_attempts"."failed_at" IS NULL
      ) OR (
        "content_generation_attempts"."status" = 'FAILED'
        AND "content_generation_attempts"."error_category" IS NOT NULL
        AND "content_generation_attempts"."completed_at" IS NULL
        AND "content_generation_attempts"."failed_at" IS NOT NULL
      )),
	CONSTRAINT "content_generation_attempts_timestamp_order_check" CHECK ((
        "content_generation_attempts"."started_at" IS NULL OR "content_generation_attempts"."started_at" >= "content_generation_attempts"."created_at"
      ) AND (
        "content_generation_attempts"."completed_at" IS NULL OR "content_generation_attempts"."completed_at" >= COALESCE("content_generation_attempts"."started_at", "content_generation_attempts"."created_at")
      ) AND (
        "content_generation_attempts"."failed_at" IS NULL OR "content_generation_attempts"."failed_at" >= COALESCE("content_generation_attempts"."started_at", "content_generation_attempts"."created_at")
      ))
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"document" jsonb NOT NULL,
	"source" text NOT NULL,
	"ai_run_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_versions_content_id_version_number_unique" UNIQUE("content_id","version_number"),
	CONSTRAINT "content_versions_ai_run_id_unique" UNIQUE("ai_run_id"),
	CONSTRAINT "content_versions_version_number_positive_check" CHECK ("content_versions"."version_number" > 0),
	CONSTRAINT "content_versions_source_check" CHECK ("content_versions"."source" = 'AI_GENERATED')
);
--> statement-breakpoint
CREATE TABLE "contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_idea_id" uuid NOT NULL,
	"content_language" text NOT NULL,
	"format" text NOT NULL,
	"source_generation_attempt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contents_source_generation_attempt_id_unique" UNIQUE("source_generation_attempt_id"),
	CONSTRAINT "contents_language_check" CHECK ("contents"."content_language" IN ('en', 'fa')),
	CONSTRAINT "contents_format_check" CHECK ("contents"."format" IN ('SHORT_VIDEO', 'LONG_VIDEO'))
);
--> statement-breakpoint
CREATE TABLE "workspace_content_generation_quota_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoked_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	CONSTRAINT "workspace_content_generation_quota_reservations_attempt_id_unique" UNIQUE("attempt_id"),
	CONSTRAINT "workspace_content_generation_quota_reservations_invocation_release_check" CHECK ("workspace_content_generation_quota_reservations"."invoked_at" IS NULL OR "workspace_content_generation_quota_reservations"."released_at" IS NULL),
	CONSTRAINT "workspace_content_generation_quota_reservations_timestamp_order_check" CHECK ((
        "workspace_content_generation_quota_reservations"."invoked_at" IS NULL OR "workspace_content_generation_quota_reservations"."invoked_at" >= "workspace_content_generation_quota_reservations"."reserved_at"
      ) AND (
        "workspace_content_generation_quota_reservations"."released_at" IS NULL OR "workspace_content_generation_quota_reservations"."released_at" >= "workspace_content_generation_quota_reservations"."reserved_at"
      ))
);
--> statement-breakpoint
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_kind_check";--> statement-breakpoint
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_prompt_version_check";--> statement-breakpoint
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_provider_check";--> statement-breakpoint
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_model_check";--> statement-breakpoint
ALTER TABLE "ai_runs" ADD COLUMN "provider_request_correlation" text;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_attempts" ADD CONSTRAINT "content_generation_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_attempts" ADD CONSTRAINT "content_generation_attempts_source_idea_id_ideas_id_fk" FOREIGN KEY ("source_idea_id") REFERENCES "public"."ideas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_attempts" ADD CONSTRAINT "content_generation_attempts_content_dna_version_id_content_dna_versions_id_fk" FOREIGN KEY ("content_dna_version_id") REFERENCES "public"."content_dna_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_attempts" ADD CONSTRAINT "content_generation_attempts_workspace_ai_run_fk" FOREIGN KEY ("workspace_id","ai_run_id") REFERENCES "public"."ai_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_source_idea_id_ideas_id_fk" FOREIGN KEY ("source_idea_id") REFERENCES "public"."ideas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_workspace_source_generation_attempt_fk" FOREIGN KEY ("workspace_id","source_generation_attempt_id") REFERENCES "public"."content_generation_attempts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_content_generation_quota_reservations" ADD CONSTRAINT "workspace_content_generation_quota_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_content_generation_quota_reservations" ADD CONSTRAINT "workspace_content_generation_quota_reservations_workspace_attempt_fk" FOREIGN KEY ("workspace_id","attempt_id") REFERENCES "public"."content_generation_attempts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_drafts_updated_at_idx" ON "content_drafts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "content_generation_attempts_source_idea_id_created_at_idx" ON "content_generation_attempts" USING btree ("source_idea_id","created_at");--> statement-breakpoint
CREATE INDEX "content_generation_attempts_workspace_created_at_idx" ON "content_generation_attempts" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "contents_workspace_id_idx" ON "contents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "contents_source_idea_id_idx" ON "contents" USING btree ("source_idea_id");--> statement-breakpoint
CREATE INDEX "workspace_content_generation_quota_reservations_workspace_reserved_at_idx" ON "workspace_content_generation_quota_reservations" USING btree ("workspace_id","reserved_at");--> statement-breakpoint
CREATE INDEX "workspace_content_generation_quota_reservations_workspace_invoked_at_idx" ON "workspace_content_generation_quota_reservations" USING btree ("workspace_id","invoked_at");--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_content_output_snapshot_check" CHECK ("ai_runs"."kind" <> 'CONTENT_SCRIPT_GENERATION'
        OR "ai_runs"."status" <> 'COMPLETED'
        OR "ai_runs"."output_snapshot" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_provider_request_correlation_check" CHECK ("ai_runs"."provider_request_correlation" IS NULL OR char_length("ai_runs"."provider_request_correlation") > 0);--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_kind_check" CHECK ("ai_runs"."kind" IN ('IDEA_GENERATION', 'CONTENT_SCRIPT_GENERATION'));--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_provider_check" CHECK ((
        "ai_runs"."kind" = 'IDEA_GENERATION'
        AND (
          ("ai_runs"."provider" = 'avalai' AND "ai_runs"."model" = 'gpt-5.6-luna')
          OR ("ai_runs"."provider" = 'openai' AND "ai_runs"."model" = 'gpt-5.6-terra')
        )
      ) OR (
        "ai_runs"."kind" = 'CONTENT_SCRIPT_GENERATION'
        AND "ai_runs"."provider" = 'avalai'
        AND "ai_runs"."model" = 'gpt-5.6-luna'
      ));--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_model_check" CHECK ((
        "ai_runs"."kind" = 'IDEA_GENERATION'
        AND (
          ("ai_runs"."provider" = 'avalai' AND "ai_runs"."model" = 'gpt-5.6-luna')
          OR ("ai_runs"."provider" = 'openai' AND "ai_runs"."model" = 'gpt-5.6-terra')
        )
      ) OR (
        "ai_runs"."kind" = 'CONTENT_SCRIPT_GENERATION'
        AND "ai_runs"."provider" = 'avalai'
        AND "ai_runs"."model" = 'gpt-5.6-luna'
      ));--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_prompt_version_check" CHECK ((
        "ai_runs"."kind" = 'IDEA_GENERATION' AND "ai_runs"."prompt_version" = 'idea-generation/v1'
      ) OR (
        "ai_runs"."kind" = 'CONTENT_SCRIPT_GENERATION'
        AND "ai_runs"."prompt_version" = 'content-script-generation/v1'
      ));
--> statement-breakpoint
CREATE FUNCTION "guard_content_generation_attempt_updates"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."workspace_id" IS DISTINCT FROM NEW."workspace_id"
    OR OLD."source_idea_id" IS DISTINCT FROM NEW."source_idea_id"
    OR OLD."content_dna_version_id" IS DISTINCT FROM NEW."content_dna_version_id"
    OR OLD."requested_language" IS DISTINCT FROM NEW."requested_language"
    OR OLD."format" IS DISTINCT FROM NEW."format"
    OR OLD."instructions" IS DISTINCT FROM NEW."instructions"
    OR OLD."idempotency_key" IS DISTINCT FROM NEW."idempotency_key"
    OR OLD."request_fingerprint" IS DISTINCT FROM NEW."request_fingerprint"
    OR OLD."ai_run_id" IS DISTINCT FROM NEW."ai_run_id"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
    RAISE EXCEPTION 'content_generation_attempts request and lineage fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'PENDING' AND NEW."status" IN ('RUNNING', 'FAILED'))
    OR (OLD."status" = 'RUNNING' AND NEW."status" IN ('COMPLETED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'content_generation_attempts lifecycle transition is invalid' USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = NEW."status" AND (
    OLD."error_category" IS DISTINCT FROM NEW."error_category"
    OR OLD."started_at" IS DISTINCT FROM NEW."started_at"
    OR OLD."completed_at" IS DISTINCT FROM NEW."completed_at"
    OR OLD."failed_at" IS DISTINCT FROM NEW."failed_at"
  ) THEN
    RAISE EXCEPTION 'content_generation_attempts lifecycle fields change only during a transition' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "content_generation_attempts_guard_updates"
BEFORE UPDATE ON "content_generation_attempts"
FOR EACH ROW EXECUTE FUNCTION "guard_content_generation_attempt_updates"();--> statement-breakpoint
CREATE FUNCTION "prevent_content_updates"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'contents records are immutable' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "contents_immutable"
BEFORE UPDATE ON "contents"
FOR EACH ROW EXECUTE FUNCTION "prevent_content_updates"();--> statement-breakpoint
CREATE FUNCTION "prevent_content_version_updates"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'content_versions records are immutable' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "content_versions_immutable"
BEFORE UPDATE ON "content_versions"
FOR EACH ROW EXECUTE FUNCTION "prevent_content_version_updates"();--> statement-breakpoint
CREATE FUNCTION "guard_ai_run_updates"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."id" IS DISTINCT FROM NEW."id"
    OR OLD."workspace_id" IS DISTINCT FROM NEW."workspace_id"
    OR OLD."kind" IS DISTINCT FROM NEW."kind"
    OR OLD."provider" IS DISTINCT FROM NEW."provider"
    OR OLD."model" IS DISTINCT FROM NEW."model"
    OR OLD."prompt_version" IS DISTINCT FROM NEW."prompt_version"
    OR OLD."generation_settings" IS DISTINCT FROM NEW."generation_settings"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
    RAISE EXCEPTION 'ai_runs configuration fields are immutable' USING ERRCODE = '55000';
  END IF;

  -- Phase 3 operations retain their established lifecycle behavior. The
  -- remaining Phase 4 lifecycle/outcome guard applies only to Content Script.
  IF OLD."kind" <> 'CONTENT_SCRIPT_GENERATION' THEN
    RETURN NEW;
  END IF;

  IF OLD."output_snapshot" IS NOT NULL AND OLD."output_snapshot" IS DISTINCT FROM NEW."output_snapshot"
    OR OLD."usage" IS NOT NULL AND OLD."usage" IS DISTINCT FROM NEW."usage"
    OR OLD."provider_request_correlation" IS NOT NULL AND OLD."provider_request_correlation" IS DISTINCT FROM NEW."provider_request_correlation" THEN
    RAISE EXCEPTION 'ai_runs terminal outcome fields are write-once' USING ERRCODE = '55000';
  END IF;

  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'PENDING' AND NEW."status" IN ('RUNNING', 'FAILED'))
    OR (OLD."status" = 'RUNNING' AND NEW."status" IN ('COMPLETED', 'FAILED'))
  ) THEN
    RAISE EXCEPTION 'ai_runs lifecycle transition is invalid' USING ERRCODE = '55000';
  END IF;

  IF OLD."status" = NEW."status" AND (
    OLD."error_category" IS DISTINCT FROM NEW."error_category"
    OR OLD."started_at" IS DISTINCT FROM NEW."started_at"
    OR OLD."completed_at" IS DISTINCT FROM NEW."completed_at"
    OR OLD."failed_at" IS DISTINCT FROM NEW."failed_at"
  ) THEN
    RAISE EXCEPTION 'ai_runs lifecycle fields change only during a transition' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ai_runs_guard_updates"
BEFORE UPDATE ON "ai_runs"
FOR EACH ROW EXECUTE FUNCTION "guard_ai_run_updates"();
--> statement-breakpoint
CREATE FUNCTION "guard_content_draft_updates"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."content_id" IS DISTINCT FROM NEW."content_id"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at" THEN
    RAISE EXCEPTION 'content_drafts identity fields are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "content_drafts_guard_updates"
BEFORE UPDATE ON "content_drafts"
FOR EACH ROW EXECUTE FUNCTION "guard_content_draft_updates"();
--> statement-breakpoint
CREATE FUNCTION "assert_content_generation_attempt_result_consistency"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_attempt_id uuid;
  attempt_status text;
  run_status text;
  attempt_error_category text;
  run_error_category text;
  attempt_started_at timestamptz;
  run_started_at timestamptz;
  attempt_completed_at timestamptz;
  run_completed_at timestamptz;
  attempt_failed_at timestamptz;
  run_failed_at timestamptz;
  result_content_id uuid;
  has_content boolean;
  has_draft boolean;
  has_initial_version boolean;
  run_output_snapshot jsonb;
  draft_document jsonb;
  draft_revision integer;
  initial_version_document jsonb;
BEGIN
  IF TG_TABLE_NAME = 'content_generation_attempts' THEN
    target_attempt_id := COALESCE(NEW."id", OLD."id");
  ELSIF TG_TABLE_NAME = 'contents' THEN
    target_attempt_id := COALESCE(NEW."source_generation_attempt_id", OLD."source_generation_attempt_id");
  ELSIF TG_TABLE_NAME = 'content_drafts' OR TG_TABLE_NAME = 'content_versions' THEN
    SELECT "source_generation_attempt_id" INTO target_attempt_id
    FROM "contents"
    WHERE "id" = COALESCE(NEW."content_id", OLD."content_id");
  ELSE
    SELECT "id" INTO target_attempt_id
    FROM "content_generation_attempts"
    WHERE "ai_run_id" = COALESCE(NEW."id", OLD."id");

    IF target_attempt_id IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT
    attempt."status",
    run."status",
    attempt."error_category",
    run."error_category",
    attempt."started_at",
    run."started_at",
    attempt."completed_at",
    run."completed_at",
    attempt."failed_at",
    run."failed_at"
  INTO
    attempt_status,
    run_status,
    attempt_error_category,
    run_error_category,
    attempt_started_at,
    run_started_at,
    attempt_completed_at,
    run_completed_at,
    attempt_failed_at,
    run_failed_at
  FROM "content_generation_attempts" AS attempt
  JOIN "ai_runs" AS run ON run."id" = attempt."ai_run_id"
  WHERE attempt."id" = target_attempt_id;

  IF attempt_status IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM "contents" WHERE "source_generation_attempt_id" = target_attempt_id
  ) INTO has_content;

  IF attempt_status IS DISTINCT FROM run_status THEN
    RAISE EXCEPTION 'content_generation_attempts and ai_runs lifecycle states must match' USING ERRCODE = '55000';
  END IF;

  IF attempt_error_category IS DISTINCT FROM run_error_category
    OR attempt_started_at IS DISTINCT FROM run_started_at
    OR attempt_completed_at IS DISTINCT FROM run_completed_at
    OR attempt_failed_at IS DISTINCT FROM run_failed_at THEN
    RAISE EXCEPTION 'content_generation_attempts and ai_runs outcome fields must match' USING ERRCODE = '55000';
  END IF;

  IF attempt_status = 'COMPLETED' AND NOT has_content THEN
    RAISE EXCEPTION 'completed content_generation_attempts require one Content result' USING ERRCODE = '55000';
  END IF;

  IF attempt_status = 'COMPLETED' THEN
    SELECT "id" INTO result_content_id
    FROM "contents"
    WHERE "source_generation_attempt_id" = target_attempt_id;

    SELECT "document", "revision"
    INTO draft_document, draft_revision
    FROM "content_drafts"
    WHERE "content_id" = result_content_id;
    has_draft := FOUND;

    SELECT "document"
    INTO initial_version_document
    FROM "content_versions"
    WHERE "content_id" = result_content_id AND "version_number" = 1;
    has_initial_version := FOUND;

    IF NOT has_draft OR NOT has_initial_version THEN
      RAISE EXCEPTION 'completed content_generation_attempts require a Draft and Version #1' USING ERRCODE = '55000';
    END IF;

    SELECT "output_snapshot" INTO run_output_snapshot
    FROM "ai_runs"
    WHERE "id" = (
      SELECT "ai_run_id" FROM "content_generation_attempts" WHERE "id" = target_attempt_id
    );

    IF TG_TABLE_NAME = 'content_drafts' AND TG_OP = 'INSERT' THEN
      IF draft_revision <> 1
        OR run_output_snapshot IS DISTINCT FROM draft_document
        OR draft_document IS DISTINCT FROM initial_version_document THEN
        RAISE EXCEPTION 'initial Content Draft must be revision 1 and equal the canonical AI Run output' USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;

  IF attempt_status <> 'COMPLETED' AND has_content THEN
    RAISE EXCEPTION 'only completed content_generation_attempts may have Content results' USING ERRCODE = '55000';
  END IF;

  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "content_generation_attempts_result_consistency"
AFTER INSERT OR UPDATE OR DELETE ON "content_generation_attempts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_content_generation_attempt_result_consistency"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "contents_result_consistency"
AFTER INSERT OR UPDATE OR DELETE ON "contents"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_content_generation_attempt_result_consistency"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "content_drafts_result_consistency"
AFTER INSERT OR UPDATE OR DELETE ON "content_drafts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_content_generation_attempt_result_consistency"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "content_versions_result_consistency"
AFTER INSERT OR UPDATE OR DELETE ON "content_versions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_content_generation_attempt_result_consistency"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ai_runs_content_attempt_lifecycle_consistency"
AFTER UPDATE OR DELETE ON "ai_runs"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_content_generation_attempt_result_consistency"();--> statement-breakpoint
CREATE FUNCTION "assert_content_version_source_ai_run"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_attempt_ai_run_id uuid;
BEGIN
  SELECT attempt."ai_run_id"
  INTO source_attempt_ai_run_id
  FROM "contents" AS content
  JOIN "content_generation_attempts" AS attempt
    ON attempt."id" = content."source_generation_attempt_id"
  WHERE content."id" = NEW."content_id";

  IF source_attempt_ai_run_id IS DISTINCT FROM NEW."ai_run_id" THEN
    RAISE EXCEPTION 'content_versions AI Run must match the source generation Attempt' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "content_versions_source_ai_run_matches_attempt"
BEFORE INSERT OR UPDATE ON "content_versions"
FOR EACH ROW EXECUTE FUNCTION "assert_content_version_source_ai_run"();
