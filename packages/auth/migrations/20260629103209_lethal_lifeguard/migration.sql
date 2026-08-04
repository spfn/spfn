-- Corrective migration: drop leftover bigserial sequence defaults on FK columns.
--
-- These columns were originally declared `bigserial` in 0000 and converted to
-- `bigint` in 0002. Postgres `ALTER COLUMN ... SET DATA TYPE bigint` does NOT drop
-- the serial-created `DEFAULT nextval(...)`, so every DB that ran those migrations
-- still has a dangling sequence default on each FK column. That default is wrong:
-- an FK with no explicit value would silently receive a sequence number instead of
-- pointing at a real parent row. The entities define these columns with no default
-- (foreignKey() -> bigint, not null, no default) and all writers set them explicitly,
-- so the live DB is simply diverged. Drizzle cannot detect this — its snapshot already
-- shows bigint/no-default — so this corrective migration is written by hand.

ALTER TABLE "spfn_auth"."users" ALTER COLUMN "role_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_profiles" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_public_keys" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_social_accounts" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_invitations" ALTER COLUMN "role_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_invitations" ALTER COLUMN "invited_by_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."role_permissions" ALTER COLUMN "role_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."role_permissions" ALTER COLUMN "permission_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_permissions" ALTER COLUMN "user_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_permissions" ALTER COLUMN "permission_id" DROP DEFAULT;--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."users_role_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."user_profiles_user_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."user_public_keys_user_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."user_social_accounts_user_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."user_invitations_role_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."user_invitations_invited_by_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."role_permissions_role_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."role_permissions_permission_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."user_permissions_user_id_seq";--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_auth"."user_permissions_permission_id_seq";
