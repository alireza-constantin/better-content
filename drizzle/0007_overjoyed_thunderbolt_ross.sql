ALTER TABLE "ideas" ADD COLUMN "production_queue_position" integer;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_production_queue_position_positive_check" CHECK ("ideas"."production_queue_position" IS NULL OR "ideas"."production_queue_position" > 0);--> statement-breakpoint
WITH eligible_ideas AS (
  SELECT
    i.id,
    row_number() OVER (
      PARTITION BY b.workspace_id
      ORDER BY b.created_at ASC, i.position ASC, i.id ASC
    )::integer AS seeded_position
  FROM ideas AS i
  INNER JOIN idea_generation_batches AS b ON b.id = i.batch_id
  WHERE i.status = 'ACCEPTED'
    AND NOT EXISTS (
      SELECT 1
      FROM contents AS c
      WHERE c.source_idea_id = i.id
    )
)
UPDATE ideas AS i
SET production_queue_position = eligible_ideas.seeded_position
FROM eligible_ideas
WHERE i.id = eligible_ideas.id;
