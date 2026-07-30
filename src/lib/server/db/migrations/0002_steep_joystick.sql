CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_hash_unique` ON `media` (`hash`);