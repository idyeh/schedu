CREATE TABLE `attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`status` text NOT NULL,
	`slot_id` text NOT NULL,
	`seat` integer NOT NULL,
	`slot` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`topic` text NOT NULL,
	`score` integer,
	`feedback` text DEFAULT '' NOT NULL,
	`history` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bookings_student_status` ON `bookings` (`student_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_bookings_slot` ON `bookings` (`slot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_active_seat` ON `bookings` (`slot_id`,`seat`) WHERE "bookings"."status" in ('submitted','approved','in_progress');--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`password` text NOT NULL,
	`profile` text NOT NULL,
	`first_login` integer DEFAULT 1 NOT NULL,
	`blocked_until` integer DEFAULT 0 NOT NULL
);
