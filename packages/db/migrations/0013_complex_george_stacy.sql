CREATE TABLE IF NOT EXISTS "build_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mission_id" uuid,
	"repo_url" text NOT NULL,
	"writeup" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "viva_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viva_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"video_url" text,
	"video_seconds" integer,
	"transcript" text,
	"clarity_score" integer,
	"depth_score" integer,
	"accuracy_score" integer,
	"confidence" text,
	"llm_rationale" text,
	"override_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "viva_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"track" text NOT NULL,
	"status" text NOT NULL,
	"questions_json" jsonb,
	"questions_edited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"llm_raw_score" real,
	"llm_confidence" text,
	"llm_grading_json" jsonb,
	"reviewer_id" uuid,
	"reviewer_score" real,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"raw_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "build_submissions" ADD CONSTRAINT "build_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viva_answers" ADD CONSTRAINT "viva_answers_viva_id_viva_exams_id_fk" FOREIGN KEY ("viva_id") REFERENCES "public"."viva_exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viva_exams" ADD CONSTRAINT "viva_exams_submission_id_build_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."build_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viva_exams" ADD CONSTRAINT "viva_exams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viva_exams" ADD CONSTRAINT "viva_exams_questions_edited_by_users_id_fk" FOREIGN KEY ("questions_edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "viva_exams" ADD CONSTRAINT "viva_exams_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_submissions_user_idx" ON "build_submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viva_answers_viva_idx" ON "viva_answers" USING btree ("viva_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viva_exams_submission_idx" ON "viva_exams" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viva_exams_user_idx" ON "viva_exams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "viva_exams_status_idx" ON "viva_exams" USING btree ("status");