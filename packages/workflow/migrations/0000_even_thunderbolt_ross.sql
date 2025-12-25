CREATE SCHEMA "spfn_workflow";
--> statement-breakpoint
CREATE TABLE "spfn_workflow"."executions" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"current_step" integer DEFAULT 0 NOT NULL,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spfn_workflow"."step_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"step_name" text NOT NULL,
	"step_index" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spfn_workflow"."step_executions" ADD CONSTRAINT "step_executions_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "spfn_workflow"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wf_exec_workflow_name_idx" ON "spfn_workflow"."executions" USING btree ("workflow_name");--> statement-breakpoint
CREATE INDEX "wf_exec_status_idx" ON "spfn_workflow"."executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wf_exec_created_at_idx" ON "spfn_workflow"."executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wf_exec_workflow_status_idx" ON "spfn_workflow"."executions" USING btree ("workflow_name","status");--> statement-breakpoint
CREATE INDEX "wf_step_exec_execution_id_idx" ON "spfn_workflow"."step_executions" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "wf_step_exec_status_idx" ON "spfn_workflow"."step_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wf_step_exec_exec_step_idx" ON "spfn_workflow"."step_executions" USING btree ("execution_id","step_index");