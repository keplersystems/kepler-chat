DROP INDEX "conversation_project_idx";--> statement-breakpoint
DROP INDEX "media_hash_unique";--> statement-breakpoint
DROP INDEX "message_conversation_idx";--> statement-breakpoint
DROP INDEX "part_message_idx";--> statement-breakpoint
ALTER TABLE `conversation` ALTER COLUMN "mode" TO "mode" text NOT NULL DEFAULT 'work';--> statement-breakpoint
CREATE INDEX `conversation_project_idx` ON `conversation` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_hash_unique` ON `media` (`hash`);--> statement-breakpoint
CREATE INDEX `message_conversation_idx` ON `message` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `part_message_idx` ON `part` (`message_id`,`ord`);--> statement-breakpoint
UPDATE `conversation` SET `mode` = 'work' WHERE `mode` = 'agent';