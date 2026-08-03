CREATE TABLE IF NOT EXISTS "application_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_audit_log" ADD CONSTRAINT "application_audit_log_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_audit_log" ADD CONSTRAINT "application_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_audit_log_app_idx" ON "application_audit_log" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_audit_log_actor_idx" ON "application_audit_log" USING btree ("actor_id");--> statement-breakpoint
UPDATE applications SET status = 'screening' WHERE status = 'reviewing';