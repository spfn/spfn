ALTER TABLE "spfn_auth"."users" ADD COLUMN "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "users_public_id_idx" ON "spfn_auth"."users" USING btree ("public_id");--> statement-breakpoint
ALTER TABLE "spfn_auth"."users" ADD CONSTRAINT "users_public_id_unique" UNIQUE("public_id");