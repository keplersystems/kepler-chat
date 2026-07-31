CREATE TABLE `agent_env_profile` (
	`agent_id` text NOT NULL,
	`env_key` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`agent_id`, `env_key`)
);
--> statement-breakpoint
CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`acp_session_id` text,
	`project_id` text,
	`title` text NOT NULL,
	`model_value` text,
	`mode_id` text,
	`context_used` integer,
	`context_size` integer,
	`total_cost` real DEFAULT 0 NOT NULL,
	`total_tokens` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_project_idx` ON `conversation` (`project_id`);--> statement-breakpoint
CREATE TABLE `mcp_server` (
	`name` text NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`name`, `project_id`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_hash_unique` ON `media` (`hash`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`stop_reason` text,
	`error` text,
	`model_value` text,
	`cost` real,
	`tokens` text,
	`context_used` integer,
	`context_size` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_conversation_idx` ON `message` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `part` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`ord` integer NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `part_message_idx` ON `part` (`message_id`,`ord`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
