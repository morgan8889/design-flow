CREATE TABLE `pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`branch_ref` text NOT NULL,
	`spec_number` text,
	`state` text NOT NULL,
	`merged_at` text,
	`html_url` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
