CREATE TABLE "asset_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"failure_code" text,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_jobs_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "asset_jobs_type_check" CHECK ("asset_jobs"."type" IN ('PROCESS_UPLOAD', 'INGEST_EXTERNAL_URL', 'DELETE_ASSET', 'EXPIRE_UPLOAD', 'RECONCILE_STORAGE')),
	CONSTRAINT "asset_jobs_status_check" CHECK ("asset_jobs"."status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "asset_jobs_attempts_check" CHECK ("asset_jobs"."attempts" >= 0 AND "asset_jobs"."max_attempts" BETWEEN 1 AND 5 AND "asset_jobs"."attempts" <= "asset_jobs"."max_attempts"),
	CONSTRAINT "asset_jobs_payload_check" CHECK (jsonb_typeof("asset_jobs"."payload") = 'object' AND "asset_jobs"."payload" ? 'assetId' AND jsonb_typeof("asset_jobs"."payload"->'assetId') = 'string' AND "asset_jobs"."payload" = jsonb_build_object('assetId', "asset_jobs"."payload"->'assetId')),
	CONSTRAINT "asset_jobs_running_lease_check" CHECK (("asset_jobs"."status" = 'RUNNING') = ("asset_jobs"."lease_owner" IS NOT NULL AND "asset_jobs"."lease_expires_at" IS NOT NULL)),
	CONSTRAINT "asset_jobs_terminal_timestamp_check" CHECK (("asset_jobs"."status" = 'COMPLETED') = ("asset_jobs"."completed_at" IS NOT NULL) AND ("asset_jobs"."status" = 'FAILED') = ("asset_jobs"."failed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "asset_jobs_due_idx" ON "asset_jobs" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "asset_jobs_lease_expiry_idx" ON "asset_jobs" USING btree ("status","lease_expires_at");
