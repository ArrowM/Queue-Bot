export interface AdminPermission {
	id: number;
	guild_id: string;
	role_member_id: string;
	is_role: boolean;
}

export interface BlackWhiteList {
	id: number;
	queue_channel_id: string;
	role_member_id: string;
	type: number;
	is_role: boolean;
}

export interface DisplayChannels {
	id: number;
	queue_channel_id: string;
	display_channel_id: string;
	message_id: string;
	is_inline: boolean;
}

export interface LastPulled {
	id: number;
	queue_channel_id: string;
	voice_channel_id: string;
	member_id: string;
}

export interface Priority {
	id: number;
	guild_id: string;
	role_member_id: string;
	is_role: boolean;
}

export interface QueueChannels {
	id: number;
	queue_channel_id: string;
	guild_id: string;
	max_members: number;
	target_channel_id: string;
	auto_fill: boolean;
	pull_num: number;
	header: string;
	color: string;
	grace_period: number;
	role_id: string;
	hide_button: boolean;
	is_locked: boolean;
	clear_utc_offset: boolean;
	enable_partial_pull: boolean;
	mute: boolean;
}

export interface QueueGuilds {
	id: number;
	guild_id: string;
	prefix: string;
	msg_mode: number;
	cleanup_commands: boolean;
	disable_mentions: boolean;
	disable_roles: boolean;
	disable_notifications: boolean;
	timestamps: string;
	logging_channel_id: string;
	logging_channel_level: number;
	role_prefix: string;
}

export interface QueueMembers {
	id: number;
	channel_id: string;
	member_id: string;
	personal_message: string;
	created_at: string;
	is_priority: boolean;
	display_time: string;
}

export interface Schedules {
	id: number;
	command: string;
	queue_channel_id: string;
	schedule: string;
	utc_offset: number;
}