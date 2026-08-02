CREATE TABLE IF NOT EXISTS "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correct" boolean,
	"score_fraction" real,
	"graded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_session_question_unique" UNIQUE("session_id","question_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessment_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"telemetry" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"track" text NOT NULL,
	"layer" integer DEFAULT 1 NOT NULL,
	"time_limit_seconds" integer,
	"question_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"job_id" uuid,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "question_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" varchar(120),
	"track" text NOT NULL,
	"skill_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kind" text NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"prompt" text NOT NULL,
	"payload" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_bank_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"track" text NOT NULL,
	"raw_score" real NOT NULL,
	"percentile" real NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_results_session_unique" UNIQUE("session_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_question_bank_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question_bank"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_results" ADD CONSTRAINT "track_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track_results" ADD CONSTRAINT "track_results_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "answers_session_idx" ON "answers" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_sessions_user_idx" ON "assessment_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_sessions_assessment_idx" ON "assessment_sessions" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_author_idx" ON "assessments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_job_idx" ON "assessments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_bank_track_idx" ON "question_bank" USING btree ("track");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_bank_author_idx" ON "question_bank" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_results_user_idx" ON "track_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "track_results_track_idx" ON "track_results" USING btree ("track");