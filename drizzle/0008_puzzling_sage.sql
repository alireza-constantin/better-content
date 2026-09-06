ALTER TABLE "content_versions" DROP CONSTRAINT "content_versions_source_check";--> statement-breakpoint
ALTER TABLE "content_versions" ALTER COLUMN "ai_run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "accepted_version_id" uuid;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_id_id_candidate_key" UNIQUE("content_id","id");--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_accepted_version_same_content_fk" FOREIGN KEY ("id","accepted_version_id") REFERENCES "content_versions"("content_id","id");--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_source_ai_run_check" CHECK ((
      ("content_versions"."source" = 'AI_GENERATED' AND "content_versions"."ai_run_id" IS NOT NULL)
      OR ("content_versions"."source" IN ('LEGACY_DRAFT_CHECKPOINT', 'CREATOR_ACCEPTED') AND "content_versions"."ai_run_id" IS NULL)
    ));--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_source_check" CHECK ("content_versions"."source" IN ('AI_GENERATED', 'LEGACY_DRAFT_CHECKPOINT', 'CREATOR_ACCEPTED'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_content_updates"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'accepted_version_id') IS DISTINCT FROM (to_jsonb(OLD) - 'accepted_version_id') THEN
    RAISE EXCEPTION 'contents identity and lineage fields are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "assert_content_version_source_ai_run"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_attempt_ai_run_id uuid;
BEGIN
  IF NEW."source" <> 'AI_GENERATED' THEN
    RETURN NEW;
  END IF;

  SELECT attempt."ai_run_id"
  INTO source_attempt_ai_run_id
  FROM "contents" AS content
  JOIN "content_generation_attempts" AS attempt
    ON attempt."id" = content."source_generation_attempt_id"
  WHERE content."id" = NEW."content_id";

  IF source_attempt_ai_run_id IS DISTINCT FROM NEW."ai_run_id" THEN
    RAISE EXCEPTION 'AI_GENERATED content_versions AI Run must match the source generation Attempt' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
