CREATE TABLE "spfn_auth"."signup_link_tokens" (
	"id" bigserial PRIMARY KEY,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"return_path" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"setup_secret_hash" text,
	"setup_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signup_link_token_hash_idx" ON "spfn_auth"."signup_link_tokens" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "signup_link_setup_secret_hash_idx" ON "spfn_auth"."signup_link_tokens" ("setup_secret_hash");--> statement-breakpoint
CREATE INDEX "signup_link_email_idx" ON "spfn_auth"."signup_link_tokens" ("email","expires_at");