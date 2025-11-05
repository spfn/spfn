CREATE TABLE "spfn_auth"."roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "spfn_auth"."permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"category" text,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "spfn_auth"."role_permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"role_id" bigint NOT NULL,
	"permission_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_unique" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "spfn_auth"."user_permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"permission_id" bigint NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permissions_unique" UNIQUE("user_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "spfn_auth"."users" ADD COLUMN "role_id" bigint;--> statement-breakpoint
ALTER TABLE "spfn_auth"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "spfn_auth"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "spfn_auth"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "spfn_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "spfn_auth"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roles_name_idx" ON "spfn_auth"."roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "roles_is_system_idx" ON "spfn_auth"."roles" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "roles_is_active_idx" ON "spfn_auth"."roles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "roles_is_builtin_idx" ON "spfn_auth"."roles" USING btree ("is_builtin");--> statement-breakpoint
CREATE INDEX "roles_priority_idx" ON "spfn_auth"."roles" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "permissions_name_idx" ON "spfn_auth"."permissions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "permissions_category_idx" ON "spfn_auth"."permissions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "permissions_is_system_idx" ON "spfn_auth"."permissions" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "permissions_is_active_idx" ON "spfn_auth"."permissions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "permissions_is_builtin_idx" ON "spfn_auth"."permissions" USING btree ("is_builtin");--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_idx" ON "spfn_auth"."role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_idx" ON "spfn_auth"."role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_permissions_user_id_idx" ON "spfn_auth"."user_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_permissions_permission_id_idx" ON "spfn_auth"."user_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_permissions_expires_at_idx" ON "spfn_auth"."user_permissions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "spfn_auth"."users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "spfn_auth"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "spfn_auth"."users" USING btree ("role_id");