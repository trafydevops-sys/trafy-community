CREATE TABLE IF NOT EXISTS "build_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"track" text NOT NULL,
	"brief_markdown" text NOT NULL,
	"starter_repo_url" text,
	"time_limit_hours" integer DEFAULT 24 NOT NULL,
	"rubric_weights" jsonb NOT NULL,
	"build_command" text,
	"test_command" text,
	"metric_name" text,
	"metric_threshold" real,
	"author_id" uuid NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "build_submissions" ALTER COLUMN "mission_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "build_submissions" ALTER COLUMN "repo_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "expires_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "build_passed" boolean;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "tests_passed" boolean;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "test_output" text;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "metric_value" real;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "machine_score" real;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "correctness_score" integer;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "structure_score" integer;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "tests_score" integer;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "documentation_score" integer;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "rubric_avg" real;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "raw_score" real;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "build_submissions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "build_missions" ADD CONSTRAINT "build_missions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_missions_track_idx" ON "build_missions" USING btree ("track");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_missions_author_idx" ON "build_missions" USING btree ("author_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "build_submissions" ADD CONSTRAINT "build_submissions_mission_id_build_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."build_missions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "build_submissions" ADD CONSTRAINT "build_submissions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_submissions_mission_idx" ON "build_submissions" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "build_submissions_status_idx" ON "build_submissions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "build_submissions" ADD CONSTRAINT "build_submissions_mission_user_unique" UNIQUE("mission_id","user_id");