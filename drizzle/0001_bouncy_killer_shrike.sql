CREATE TABLE "content_dna" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"current_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_dna_workspace_id_unique" UNIQUE("workspace_id"),
	CONSTRAINT "content_dna_id_current_version_id_unique" UNIQUE("id","current_version_id")
);
--> statement-breakpoint
CREATE TABLE "content_dna_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_dna_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_dna_versions_content_dna_id_version_number_unique" UNIQUE("content_dna_id","version_number"),
	CONSTRAINT "content_dna_versions_content_dna_id_id_unique" UNIQUE("content_dna_id","id")
);
--> statement-breakpoint
ALTER TABLE "content_dna" ADD CONSTRAINT "content_dna_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_dna" ADD CONSTRAINT "content_dna_current_version_same_container_fk" FOREIGN KEY ("id","current_version_id") REFERENCES "public"."content_dna_versions"("content_dna_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_dna_versions" ADD CONSTRAINT "content_dna_versions_content_dna_id_content_dna_id_fk" FOREIGN KEY ("content_dna_id") REFERENCES "public"."content_dna"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_dna_versions" ADD CONSTRAINT "content_dna_versions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_dna" ALTER CONSTRAINT "content_dna_current_version_same_container_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE FUNCTION "prevent_content_dna_version_updates"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'content_dna_versions records are immutable' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "content_dna_versions_immutable" BEFORE UPDATE ON "content_dna_versions" FOR EACH ROW EXECUTE FUNCTION "prevent_content_dna_version_updates"();
