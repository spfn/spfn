ALTER TABLE "spfn_auth"."users" ADD COLUMN "username" text;--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "spfn_auth"."users" USING btree ("username");--> statement-breakpoint
ALTER TABLE "spfn_auth"."users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");