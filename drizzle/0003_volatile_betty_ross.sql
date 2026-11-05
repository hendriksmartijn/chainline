ALTER TABLE "rules" ADD COLUMN "count_indoor" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Bestaande cassettes: indoor telt niet mee (direct-drive trainer draait de eigen cassette).
UPDATE "rules" SET "count_indoor" = false WHERE "component_id" IN (SELECT "id" FROM "components" WHERE "type" = 'cassette');
