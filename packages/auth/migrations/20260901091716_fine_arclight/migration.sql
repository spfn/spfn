CREATE TABLE "spfn_auth"."device_authorizations" (
	"id" bigserial PRIMARY KEY,
	"device_code_hash" text NOT NULL UNIQUE,
	"user_code" text NOT NULL,
	"public_key" text NOT NULL,
	"key_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"algorithm" text DEFAULT 'ES256' NOT NULL,
	"device_name" text,
	"platform" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "device_authorization_user_code_idx" ON "spfn_auth"."device_authorizations" ("user_code");--> statement-breakpoint
ALTER TABLE "spfn_auth"."device_authorizations" ADD CONSTRAINT "device_authorizations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "spfn_auth"."users"("id") ON DELETE CASCADE;