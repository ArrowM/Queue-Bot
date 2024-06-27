ALTER TABLE `queue` RENAME COLUMN `notifications_toggle` TO `dm_member_on_pull_toggle`;--> statement-breakpoint
ALTER TABLE `queue` ADD `pull_message_display_type` text DEFAULT 'private' NOT NULL;