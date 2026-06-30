CREATE TABLE "spfn_migrate"."data_migrations" (
	"name" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
