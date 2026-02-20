CREATE SCHEMA IF NOT EXISTS "spfn_monitor";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spfn_monitor"."error_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigserial NOT NULL,
	"request_id" text,
	"user_id" text,
	"status_code" integer NOT NULL,
	"headers" jsonb,
	"query" jsonb,
	"stack_trace" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spfn_monitor"."error_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"path" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "error_groups_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spfn_monitor"."logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"source" text,
	"request_id" text,
	"user_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'error_events_group_id_error_groups_id_fk') THEN
		ALTER TABLE "spfn_monitor"."error_events" ADD CONSTRAINT "error_events_group_id_error_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "spfn_monitor"."error_groups"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_ee_group_id_idx" ON "spfn_monitor"."error_events" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_ee_created_at_idx" ON "spfn_monitor"."error_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_ee_user_id_idx" ON "spfn_monitor"."error_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_eg_fingerprint_idx" ON "spfn_monitor"."error_groups" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_eg_status_idx" ON "spfn_monitor"."error_groups" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_eg_last_seen_at_idx" ON "spfn_monitor"."error_groups" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_eg_path_idx" ON "spfn_monitor"."error_groups" USING btree ("path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_log_level_idx" ON "spfn_monitor"."logs" USING btree ("level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_log_source_idx" ON "spfn_monitor"."logs" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_log_created_at_idx" ON "spfn_monitor"."logs" USING btree ("created_at");