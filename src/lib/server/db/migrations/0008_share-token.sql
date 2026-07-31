ALTER TABLE `conversation` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_share_token_unique` ON `conversation` (`share_token`);