ALTER TABLE "spfn_cms"."audit_logs" ALTER COLUMN "label_id" SET DATA TYPE bigserial;--> statement-breakpoint
ALTER TABLE "spfn_cms"."audit_logs" ALTER COLUMN "label_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "spfn_cms"."label_values" ALTER COLUMN "label_id" SET DATA TYPE bigserial;