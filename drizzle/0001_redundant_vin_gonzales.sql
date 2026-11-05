ALTER TABLE "rules" ADD COLUMN "reset_on" text;--> statement-breakpoint
-- Bestaande wax-regels: teller reset op een waxbeurt.
UPDATE "rules" SET "reset_on" = 'waxed' WHERE "type" = 'wax_km' AND "reset_on" IS NULL;
--> statement-breakpoint
-- Bestaande kettingen krijgen de nieuwe standaardregels (slijtage + meetherinnering), als ze die nog niet hebben.
INSERT INTO "rules" ("component_id", "type", "threshold", "warning_margin", "reset_on")
SELECT c."id", 'measurement', 0.5, 0.1, NULL FROM "components" c
WHERE c."type" = 'chain' AND NOT EXISTS (SELECT 1 FROM "rules" r WHERE r."component_id" = c."id" AND r."type" = 'measurement');
--> statement-breakpoint
INSERT INTO "rules" ("component_id", "type", "threshold", "warning_margin", "reset_on")
SELECT c."id", 'km', 1000, 100, 'measured' FROM "components" c
WHERE c."type" = 'chain' AND NOT EXISTS (SELECT 1 FROM "rules" r WHERE r."component_id" = c."id" AND r."type" = 'km' AND r."reset_on" = 'measured');
