CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN IF NOT EXISTS "project_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "project_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "project_id" uuid;--> statement-breakpoint
DO $$
DECLARE
	default_project_id uuid;
	has_legacy_data boolean;
BEGIN
	SELECT EXISTS (
		SELECT 1 FROM "participants" WHERE "project_id" IS NULL
		UNION ALL
		SELECT 1 FROM "expenses" WHERE "project_id" IS NULL
		UNION ALL
		SELECT 1 FROM "settlements" WHERE "project_id" IS NULL
	) INTO has_legacy_data;

	IF has_legacy_data THEN
		INSERT INTO "projects" ("name") VALUES ('Marci') RETURNING "id" INTO default_project_id;
		UPDATE "participants" SET "project_id" = default_project_id WHERE "project_id" IS NULL;
		UPDATE "expenses" SET "project_id" = default_project_id WHERE "project_id" IS NULL;
		UPDATE "settlements" SET "project_id" = default_project_id WHERE "project_id" IS NULL;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
