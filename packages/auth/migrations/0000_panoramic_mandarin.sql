CREATE TABLE "spfn_auth"."users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"password_change_required" boolean DEFAULT false NOT NULL,
	"role_id" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "email_or_phone_check" CHECK ("spfn_auth"."users"."email" IS NOT NULL OR "spfn_auth"."users"."phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "spfn_auth"."user_social_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigserial NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"provider_email" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spfn_auth"."user_public_keys" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigserial NOT NULL,
	"key_id" text NOT NULL,
	"public_key" text NOT NULL,
	"algorithm" text DEFAULT 'ES256' NOT NULL,
	"fingerprint" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "user_public_keys_key_id_unique" UNIQUE("key_id")
);
--> statement-breakpoint
CREATE TABLE "spfn_auth"."verification_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"target" text NOT NULL,
	"target_type" text NOT NULL,
	"code" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"attempts" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "spfn_auth"."users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "spfn_auth"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_social_accounts" ADD CONSTRAINT "user_social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "spfn_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_public_keys" ADD CONSTRAINT "user_public_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "spfn_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "spfn_auth"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "spfn_auth"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "spfn_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spfn_auth"."user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "spfn_auth"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "spfn_auth"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "spfn_auth"."users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "spfn_auth"."users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "spfn_auth"."users" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_user_unique_idx" ON "spfn_auth"."user_social_accounts" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "user_public_keys_user_id_idx" ON "spfn_auth"."user_public_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_public_keys_key_id_idx" ON "spfn_auth"."user_public_keys" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "user_public_keys_active_idx" ON "spfn_auth"."user_public_keys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "user_public_keys_fingerprint_idx" ON "spfn_auth"."user_public_keys" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "target_purpose_idx" ON "spfn_auth"."verification_codes" USING btree ("target","purpose","expires_at");--> statement-breakpoint
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
CREATE INDEX "user_permissions_expires_at_idx" ON "spfn_auth"."user_permissions" USING btree ("expires_at");