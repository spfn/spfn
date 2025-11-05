CREATE SCHEMA "spfn_cms";
--> statement-breakpoint
CREATE TABLE "spfn_cms"."audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"label_id" integer,
	"action" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"changes" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spfn_cms"."draft_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"section" text NOT NULL,
	"locale" text NOT NULL,
	"user_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_draft_cache_unique" UNIQUE("section","locale","user_id")
);
--> statement-breakpoint
CREATE TABLE "spfn_cms"."label_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"label_id" integer NOT NULL,
	"version" integer,
	"locale" text DEFAULT 'ko' NOT NULL,
	"breakpoint" text,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_label_values_locale_breakpoint_unique" UNIQUE("label_id","version","locale","breakpoint")
);
--> statement-breakpoint
CREATE TABLE "spfn_cms"."labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"section" text NOT NULL,
	"type" text NOT NULL,
	"default_value" text,
	"description" text,
	"published_version" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "spfn_cms"."published_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"section" text NOT NULL,
	"locale" text NOT NULL,
	"content" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"published_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cms_published_cache_unique" UNIQUE("section","locale")
);
--> statement-breakpoint
ALTER TABLE "spfn_cms"."audit_logs" ADD CONSTRAINT "audit_logs_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "spfn_cms"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_cms"."label_values" ADD CONSTRAINT "label_values_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "spfn_cms"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_audit_logs_label_id_idx" ON "spfn_cms"."audit_logs" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "cms_audit_logs_user_id_idx" ON "spfn_cms"."audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cms_audit_logs_action_idx" ON "spfn_cms"."audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "cms_audit_logs_created_at_idx" ON "spfn_cms"."audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cms_draft_cache_section_idx" ON "spfn_cms"."draft_cache" USING btree ("section");--> statement-breakpoint
CREATE INDEX "cms_draft_cache_user_idx" ON "spfn_cms"."draft_cache" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cms_label_values_label_version_idx" ON "spfn_cms"."label_values" USING btree ("label_id","version");--> statement-breakpoint
CREATE INDEX "cms_label_values_locale_idx" ON "spfn_cms"."label_values" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "cms_labels_section_idx" ON "spfn_cms"."labels" USING btree ("section");--> statement-breakpoint
CREATE INDEX "cms_labels_key_idx" ON "spfn_cms"."labels" USING btree ("key");--> statement-breakpoint
CREATE INDEX "cms_published_cache_section_idx" ON "spfn_cms"."published_cache" USING btree ("section");