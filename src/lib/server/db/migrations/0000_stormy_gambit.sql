CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`opencode_session_id` text NOT NULL,
	`title` text NOT NULL,
	`provider_id` text,
	`model_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_message_model` (
	`conversation_id` text NOT NULL,
	`opencode_message_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_message_model_msg_uidx` ON `conversation_message_model` (`conversation_id`,`opencode_message_id`);--> statement-breakpoint
CREATE INDEX `conversation_message_model_conversation_idx` ON `conversation_message_model` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `provider_credential` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`auth_type` text NOT NULL,
	`encrypted_payload` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_env_profile` (
	`provider_id` text NOT NULL,
	`env_key` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`provider_id`, `env_key`)
);
--> statement-breakpoint
CREATE INDEX `provider_env_profile_provider_idx` ON `provider_env_profile` (`provider_id`);
