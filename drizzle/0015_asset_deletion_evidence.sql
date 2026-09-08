ALTER TABLE "assets" ADD COLUMN "deleting_from_ready" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_deleting_from_ready_check" CHECK ("assets"."deleting_from_ready" IN (0, 1));
