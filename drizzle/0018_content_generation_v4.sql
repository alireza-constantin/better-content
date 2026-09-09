-- Ticket 09: retain historical v1 AI Run metadata while allowing the V4 contract.
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_prompt_version_check";
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_prompt_version_check" CHECK (
  ("ai_runs"."kind" = 'IDEA_GENERATION' AND "ai_runs"."prompt_version" = 'idea-generation/v1')
  OR
  ("ai_runs"."kind" = 'CONTENT_SCRIPT_GENERATION'
    AND "ai_runs"."prompt_version" IN ('content-script-generation/v1', 'content-script-generation/v2'))
);
