CREATE TABLE "spfn_auth"."user_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"bio" text,
	"locale" text DEFAULT 'en',
	"timezone" text DEFAULT 'UTC',
	"date_of_birth" text,
	"gender" text,
	"website" text,
	"location" text,
	"company" text,
	"job_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "spfn_auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_profiles_user_id_idx" ON "spfn_auth"."user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_profiles_display_name_idx" ON "spfn_auth"."user_profiles" USING btree ("display_name");