ALTER TABLE `conversation` ADD `mode` text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation` ADD `engine_session_id` text;--> statement-breakpoint
ALTER TABLE `message` ADD `engine_message_id` text;--> statement-breakpoint
UPDATE `conversation` SET `engine_session_id` = `acp_session_id`;