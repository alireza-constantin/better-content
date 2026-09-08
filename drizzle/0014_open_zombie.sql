CREATE TABLE "asset_admission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_admission_events" ADD CONSTRAINT "asset_admission_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_admission_events" ADD CONSTRAINT "asset_admission_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_admission_events_user_created_at_idx" ON "asset_admission_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_admission_events_workspace_created_at_idx" ON "asset_admission_events" USING btree ("workspace_id","created_at");