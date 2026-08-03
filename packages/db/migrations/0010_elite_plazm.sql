ALTER TABLE "profiles" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "user_role" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "goals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "resume_url" text;