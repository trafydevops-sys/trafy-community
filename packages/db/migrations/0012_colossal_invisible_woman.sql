CREATE TABLE IF NOT EXISTS "assessment_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"invitee_email" text,
	"invitee_user_id" uuid,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrity_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"appeal_text" text,
	"appealed_at" timestamp with time zone,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolver_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webcam_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "webcam_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD COLUMN "webcam_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "jd_text" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "layer_config" jsonb DEFAULT '{"l1":true,"l2":false,"l3":false,"l4":false}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "invite_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_invites" ADD CONSTRAINT "assessment_invites_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_invites" ADD CONSTRAINT "assessment_invites_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrity_flags" ADD CONSTRAINT "integrity_flags_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrity_flags" ADD CONSTRAINT "integrity_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrity_flags" ADD CONSTRAINT "integrity_flags_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webcam_snapshots" ADD CONSTRAINT "webcam_snapshots_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_invites_assessment_idx" ON "assessment_invites" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_invites_token_idx" ON "assessment_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_invites_email_idx" ON "assessment_invites" USING btree ("invitee_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_flags_session_idx" ON "integrity_flags" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_flags_user_idx" ON "integrity_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integrity_flags_resolution_idx" ON "integrity_flags" USING btree ("resolution");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webcam_snapshots_session_idx" ON "webcam_snapshots" USING btree ("session_id");