ALTER TABLE "spfn_monitor"."error_events" ALTER COLUMN "group_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "spfn_monitor"."error_events" ALTER COLUMN "group_id" SET DATA TYPE bigint;
--> statement-breakpoint
DROP SEQUENCE IF EXISTS "spfn_monitor"."error_events_group_id_seq";
