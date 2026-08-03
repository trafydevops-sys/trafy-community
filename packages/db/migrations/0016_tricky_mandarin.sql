CREATE TABLE IF NOT EXISTS "job_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query" text,
	"job_type" text,
	"location" text,
	"remote" boolean,
	"experience_level" text,
	"industry" text,
	"track" text,
	"min_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_jobs" (
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_jobs_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "remote" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "experience_level" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "required_track" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "min_verified_score" real;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "tags" text[];--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_alerts_user_idx" ON "job_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_jobs_user_idx" ON "saved_jobs" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_remote_pub_idx" ON "jobs" USING btree ("remote","published");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_org_idx" ON "jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_industry_idx" ON "jobs" USING btree ("industry");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_experience_idx" ON "jobs" USING btree ("experience_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_tags_idx" ON "jobs" USING gin ("tags");