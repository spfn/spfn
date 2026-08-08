CREATE TABLE "spfn_auth"."ops_tokens" (
	"id" bigserial PRIMARY KEY,
	"name" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
