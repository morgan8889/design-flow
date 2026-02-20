CREATE TABLE `attention_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`plan_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`priority` integer NOT NULL,
	`source_url` text,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`file_path` text NOT NULL,
	`title` text NOT NULL,
	`format` text NOT NULL,
	`phases` text NOT NULL,
	`file_hash` text NOT NULL,
	`parsed_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`github_url` text,
	`local_path` text,
	`source` text NOT NULL,
	`is_tracked` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
