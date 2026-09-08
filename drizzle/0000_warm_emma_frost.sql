CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_slug` text NOT NULL,
	`display_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
CREATE INDEX `idx_messages_room_created` ON `messages` (`room_slug`,`created_at`);
