CREATE TABLE IF NOT EXISTS "batch_enrollments" (
	"batch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_enrollments_batch_id_user_id_pk" PRIMARY KEY("batch_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placement_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"role" text NOT NULL,
	"package_lpa" real,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_records_unique" UNIQUE("batch_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "type" text DEFAULT 'company' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "employee_range" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "founded_year" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batch_enrollments" ADD CONSTRAINT "batch_enrollments_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batch_enrollments" ADD CONSTRAINT "batch_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batches" ADD CONSTRAINT "batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placement_records" ADD CONSTRAINT "placement_records_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placement_records" ADD CONSTRAINT "placement_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batch_enrollments_batch_idx" ON "batch_enrollments" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batch_enrollments_user_idx" ON "batch_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_org_idx" ON "batches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "placement_records_batch_idx" ON "placement_records" USING btree ("batch_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_org_idx" ON "posts" USING btree ("organization_id");