CREATE SCHEMA IF NOT EXISTS "spfn_cms";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spfn_cms"."label_values" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"label_id" bigserial NOT NULL,
	"version" integer,
	"locale" text DEFAULT 'en' NOT NULL,
	"breakpoint" text,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_label_values_locale_breakpoint_unique" UNIQUE("label_id","version","locale","breakpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spfn_cms"."labels" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"section" text NOT NULL,
	"type" text NOT NULL,
	"default_value" jsonb,
	"description" text,
	"published_version" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spfn_cms"."published_cache" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"section" text NOT NULL,
	"locale" text NOT NULL,
	"content" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cms_published_cache_unique" UNIQUE("section","locale")
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_values_label_id_labels_id_fk') THEN
        ALTER TABLE "spfn_cms"."label_values" ADD CONSTRAINT "label_values_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "spfn_cms"."labels"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_label_values_label_version_idx" ON "spfn_cms"."label_values" USING btree ("label_id","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_label_values_locale_idx" ON "spfn_cms"."label_values" USING btree ("locale");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_labels_section_idx" ON "spfn_cms"."labels" USING btree ("section");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_labels_key_idx" ON "spfn_cms"."labels" USING btree ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cms_published_cache_section_idx" ON "spfn_cms"."published_cache" USING btree ("section");
