ALTER TABLE "applications" ADD COLUMN "screened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "assessment_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "interviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "offered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "hired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejected_at" timestamp with time zone;