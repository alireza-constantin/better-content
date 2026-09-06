CREATE OR REPLACE FUNCTION "assert_content_generation_attempt_result_consistency"() RETURNS trigger
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
    attempt."status", run."status", attempt."error_category", run."error_category",
    attempt."started_at", run."started_at", attempt."completed_at", run."completed_at",
    attempt."failed_at", run."failed_at"
  INTO
    attempt_status, run_status, attempt_error_category, run_error_category,
    attempt_started_at, run_started_at, attempt_completed_at, run_completed_at,
    attempt_failed_at, run_failed_at
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

    SELECT "revision" INTO draft_revision
    FROM "content_drafts"
    WHERE "content_id" = result_content_id;
    has_draft := FOUND;

    SELECT "document" INTO initial_version_document
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

    -- Phase 5 preserves V1 equality for immutable AI provenance. The mutable
    -- Draft is intentionally a separately derived V2 document.
    IF run_output_snapshot IS DISTINCT FROM initial_version_document THEN
      RAISE EXCEPTION 'initial Content Version must equal the canonical AI Run output' USING ERRCODE = '55000';
    END IF;

    IF TG_TABLE_NAME = 'content_drafts' AND TG_OP = 'INSERT' AND draft_revision <> 1 THEN
      RAISE EXCEPTION 'initial Content Draft must have revision 1' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF attempt_status <> 'COMPLETED' AND has_content THEN
    RAISE EXCEPTION 'only completed content_generation_attempts may have Content results' USING ERRCODE = '55000';
  END IF;

  RETURN NULL;
END;
$$;
