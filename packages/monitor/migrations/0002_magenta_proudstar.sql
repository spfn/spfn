-- pg_trgm provides the gin_trgm_ops operator class used by the trigram GIN
-- indexes below (makes leading-wildcard ILIKE searches sargable). drizzle-kit
-- cannot generate CREATE EXTENSION, so it is added here by hand. Idempotent.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "monitor_eg_name_trgm_idx" ON "spfn_monitor"."error_groups" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "monitor_eg_message_trgm_idx" ON "spfn_monitor"."error_groups" USING gin ("message" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "monitor_eg_path_trgm_idx" ON "spfn_monitor"."error_groups" USING gin ("path" gin_trgm_ops);