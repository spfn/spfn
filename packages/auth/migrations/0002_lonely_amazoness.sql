DROP INDEX "spfn_auth"."users_role_idx";--> statement-breakpoint
ALTER TABLE "spfn_auth"."users" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "spfn_auth"."users" DROP COLUMN "role";