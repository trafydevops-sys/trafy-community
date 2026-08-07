CREATE TABLE IF NOT EXISTS "mod_appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewer_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"target_user_id" uuid,
	"target_post_id" uuid,
	"action_type" text NOT NULL,
	"reason" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"issued_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_reports" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_reports" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "post_reports" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_reports" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trust_score" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_changed_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mod_appeals" ADD CONSTRAINT "mod_appeals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mod_appeals" ADD CONSTRAINT "mod_appeals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_post_id_posts_id_fk" FOREIGN KEY ("target_post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_warnings" ADD CONSTRAINT "user_warnings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_warnings" ADD CONSTRAINT "user_warnings_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mod_appeals_user_idx" ON "mod_appeals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mod_appeals_status_idx" ON "mod_appeals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_actions_admin_idx" ON "moderation_actions" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_actions_target_user_idx" ON "moderation_actions" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_actions_type_idx" ON "moderation_actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_warnings_user_idx" ON "user_warnings" USING btree ("user_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_reports_status_idx" ON "post_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_hidden_idx" ON "posts" USING btree ("hidden_at");