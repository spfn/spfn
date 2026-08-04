ALTER TABLE "spfn_auth"."users" ALTER COLUMN "role_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_profiles" ALTER COLUMN "user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_profiles" ALTER COLUMN "display_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_public_keys" ALTER COLUMN "user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_social_accounts" ALTER COLUMN "user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_invitations" ALTER COLUMN "role_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_invitations" ALTER COLUMN "invited_by_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."role_permissions" ALTER COLUMN "role_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."role_permissions" ALTER COLUMN "permission_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_permissions" ALTER COLUMN "user_id" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_permissions" ALTER COLUMN "permission_id" SET DATA TYPE bigint;