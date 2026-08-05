ALTER TABLE "spfn_auth"."user_public_keys" ADD COLUMN "client_kind" text;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_public_keys" ADD COLUMN "client_version" text;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_public_keys" ADD COLUMN "client_contract_version" text;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_public_keys" ADD COLUMN "client_seen_at" timestamp with time zone;