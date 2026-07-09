CREATE TABLE "spfn_auth"."account_deletion_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"user_public_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text DEFAULT 'self' NOT NULL,
	"reason" text,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"purge_strategy" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spfn_auth"."users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spfn_auth"."users" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "spfn_auth"."account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "spfn_auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_requests_user_id_idx" ON "spfn_auth"."account_deletion_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_deletion_requests_status_idx" ON "spfn_auth"."account_deletion_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "account_deletion_requests_purge_scheduled_at_idx" ON "spfn_auth"."account_deletion_requests" USING btree ("purge_scheduled_at");--> statement-breakpoint
CREATE INDEX "account_deletion_requests_user_public_id_idx" ON "spfn_auth"."account_deletion_requests" USING btree ("user_public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_requests_user_pending_unique_idx" ON "spfn_auth"."account_deletion_requests" USING btree ("user_id") WHERE "spfn_auth"."account_deletion_requests"."status" = 'pending';