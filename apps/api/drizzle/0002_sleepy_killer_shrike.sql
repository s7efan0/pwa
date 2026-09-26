ALTER TABLE "competitions" ADD COLUMN "is_tracked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "competitions_tracked_idx" ON "competitions" USING btree ("is_tracked");