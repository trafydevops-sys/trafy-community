CREATE TABLE IF NOT EXISTS "post_impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"viewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_owner_id" uuid NOT NULL,
	"viewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_impressions" ADD CONSTRAINT "post_impressions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_impressions" ADD CONSTRAINT "post_impressions_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_profile_owner_id_users_id_fk" FOREIGN KEY ("profile_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_impressions_post_idx" ON "post_impressions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_impressions_viewer_idx" ON "post_impressions" USING btree ("viewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_views_owner_idx" ON "profile_views" USING btree ("profile_owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_views_viewer_idx" ON "profile_views" USING btree ("viewer_id");