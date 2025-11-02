ALTER TABLE "spfn_cms"."label_values" ALTER COLUMN "version" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "spfn_cms"."label_values" ALTER COLUMN "version" DROP NOT NULL;