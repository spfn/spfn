CREATE SCHEMA "spfn_notification";
--> statement-breakpoint
CREATE TABLE "spfn_notification"."history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"template_name" text,
	"template_data" jsonb,
	"subject" text,
	"content" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"provider_name" text,
	"error_message" text,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"job_id" text,
	"batch_id" text,
	"reference_type" text,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "noti_channel_idx" ON "spfn_notification"."history" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "noti_status_idx" ON "spfn_notification"."history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "noti_recipient_idx" ON "spfn_notification"."history" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "noti_created_at_idx" ON "spfn_notification"."history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "noti_scheduled_at_idx" ON "spfn_notification"."history" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "noti_job_id_idx" ON "spfn_notification"."history" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "noti_batch_id_idx" ON "spfn_notification"."history" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "noti_reference_idx" ON "spfn_notification"."history" USING btree ("reference_type","reference_id");