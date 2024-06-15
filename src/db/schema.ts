import type { ColorResolvable, Snowflake } from "discord.js";
import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { get } from "lodash-es";

import {
	ArchivedMemberReason,
	Color,
	DisplayUpdateType,
	LogScope,
	MemberDisplayType,
	ScheduleCommand,
	TimestampType,
} from "../types/db.types.ts";

export const GUILD_TABLE = sqliteTable("guild", ({
	guildId: text("guild_id").$type<Snowflake>().primaryKey(),

	logChannelId: text("log_channel_id").$type<Snowflake | null>(),
	logScope: text("log_scope").$type<LogScope | null>(),

	joinTime: integer("joinTime").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	lastUpdateTime: integer("last_updated_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	commandsReceived: integer("commands_received").notNull().default(0),
	buttonsReceived: integer("buttons_received").notNull().default(0),
	queuesAdded: integer("queues_added").notNull().default(0),
	voicesAdded: integer("voices_added").notNull().default(0),
	displaysAdded: integer("displays_added").notNull().default(0),
	membersAdded: integer("members_added").notNull().default(0),
	schedulesAdded: integer("schedules_added").notNull().default(0),
	whitelistedAdded: integer("whitelisted_added").notNull().default(0),
	blacklistedAdded: integer("blacklisted_added").notNull().default(0),
	prioritizedAdded: integer("prioritized_added").notNull().default(0),
	adminsAdded: integer("admins_added").notNull().default(0),
	archivedMembersAdded: integer("archived_members_added").notNull().default(0),
}));

export const GUILD_RELATIONS = relations(GUILD_TABLE, ({ many }) => ({
	queues: many(QUEUE_TABLE),
	voices: many(VOICE_TABLE),
	displays: many(DISPLAY_TABLE),
	members: many(MEMBER_TABLE),
	schedules: many(SCHEDULE_TABLE),
	blacklisted: many(BLACKLISTED_TABLE),
	whitelisted: many(WHITELISTED_TABLE),
	prioritized: many(PRIORITIZED_TABLE),
	admin: many(ADMIN_TABLE),
}));

export type NewGuild = typeof GUILD_TABLE.$inferInsert;
export type DbGuild = typeof GUILD_TABLE.$inferSelect;


export const QUEUE_TABLE = sqliteTable("queue", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	name: text("name").notNull(),
	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),

	// configurable queue properties
	autopullToggle: integer("autopull_toggle", { mode: "boolean" }).notNull().default(false),
	badgeToggle: integer("badge_toggle", { mode: "boolean" }).notNull().default(true),
	buttonsToggle: integer("buttons_toggle", { mode: "boolean" }).notNull().default(true),
	color: text("color").$type<ColorResolvable>().notNull().default(get(Color, process.env.DEFAULT_COLOR) as ColorResolvable),
	displayUpdateType: text("display_update_type").$type<DisplayUpdateType>().notNull().default(DisplayUpdateType.Edit),
	header: text("header"),
	inlineToggle: integer("inline_toggle", { mode: "boolean" }).notNull().default(false),
	lockToggle: integer("lock_toggle", { mode: "boolean" }).notNull().default(false),
	memberDisplayType: text("member_display_type").$type<MemberDisplayType>().notNull().default(MemberDisplayType.Mention),
	notificationsToggle: integer("notifications_toggle", { mode: "boolean" }).notNull().default(true),
	pullBatchSize: integer("pull_batch_size").notNull().default(1),
	pullMessage: text("pull_message"),
	rejoinCooldownPeriod: integer("rejoin_cooldown_period").notNull().default(0),
	rejoinGracePeriod: integer("rejoin_grace_period").notNull().default(0),
	roleInQueueId: text("role_in_queue_id").$type<Snowflake | null>(),
	roleOnPullId: text("role_on_pull_id").$type<Snowflake | null>(),
	size: integer("size"),
	timestampType: text("time_display_type").$type<TimestampType>().default(TimestampType.Off),
	voiceDestinationChannelId: text("voice_destination_channel_id").$type<Snowflake | null>(),
	voiceOnlyToggle: integer("voice_only_toggle", { mode: "boolean" }).notNull().default(false),
}),
(table) => ({
	unq: unique().on(table.name, table.guildId),
	guildIdIndex: index("queue_guild_id_index").on(table.guildId),
}));

export const QUEUE_RELATIONS = relations(QUEUE_TABLE, ({ one, many }) => ({
	guilds: one(GUILD_TABLE, {
		fields: [QUEUE_TABLE.guildId],
		references: [GUILD_TABLE.guildId],
	}),
	voices: many(VOICE_TABLE),
	displays: many(DISPLAY_TABLE),
	members: many(MEMBER_TABLE),
	schedules: many(SCHEDULE_TABLE),
	blacklisted: many(BLACKLISTED_TABLE),
	whitelisted: many(WHITELISTED_TABLE),
	prioritized: many(PRIORITIZED_TABLE),
}));

export type NewQueue = typeof QUEUE_TABLE.$inferInsert;
export type DbQueue = typeof QUEUE_TABLE.$inferSelect;


export const VOICE_TABLE = sqliteTable("voice", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").$type<Snowflake>().notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	sourceChannelId: text("source_channel_id").$type<Snowflake>().notNull(),
	joinSyncToggle: integer("join_sync_toggle", { mode: "boolean" }).notNull().default(true),
	leaveSyncToggle: integer("leave_sync_toggle", { mode: "boolean" }).notNull().default(true),
}),
(table) => ({
	unq: unique().on(table.queueId, table.sourceChannelId),
	guildIdIndex: index("voice_guild_id_index").on(table.guildId),
}));

export const VOICE_RELATIONS = relations(VOICE_TABLE, ({ one }) => ({
	guilds: one(GUILD_TABLE),
	queues: one(QUEUE_TABLE),
}));

export type NewVoice = typeof VOICE_TABLE.$inferInsert;
export type DbVoice = typeof VOICE_TABLE.$inferSelect;


export const DISPLAY_TABLE = sqliteTable("display", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	displayChannelId: text("display_channel_id").notNull(),
	lastMessageId: text("last_message_id").$type<Snowflake | null>(),
}),
(table) => ({
	unq: unique().on(table.queueId, table.displayChannelId),
	guildIdIndex: index("display_guild_id_index").on(table.guildId),
}));

export const DISPLAY_RELATIONS = relations(DISPLAY_TABLE, ({ many }) => ({
	guilds: many(GUILD_TABLE),
	queues: many(QUEUE_TABLE),
}));

export type NewDisplay = typeof DISPLAY_TABLE.$inferInsert;
export type DbDisplay = typeof DISPLAY_TABLE.$inferSelect;


export const MEMBER_TABLE = sqliteTable("member", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	userId: text("user_id").$type<Snowflake>().notNull(),
	message: text("message"),
	positionTime: integer("position_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	joinTime: integer("join_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	priority: integer("priority"),
}),
(table) => ({
	unq: unique().on(table.queueId, table.userId),
	guildIdIndex: index("member_guild_id_index").on(table.guildId),
	priorityIndex: index("member_priority_index").on(table.priority),
	positionTimeIndex: index("member_position_time_index").on(table.positionTime),
}));

export const MEMBER_RELATIONS = relations(MEMBER_TABLE, ({ one }) => ({
	guilds: one(GUILD_TABLE, {
		fields: [MEMBER_TABLE.guildId],
		references: [GUILD_TABLE.guildId],
	}),
	queues: one(QUEUE_TABLE, {
		fields: [MEMBER_TABLE.guildId],
		references: [QUEUE_TABLE.guildId],
	}),
}));

export type NewMember = typeof MEMBER_TABLE.$inferInsert;
export type DbMember = typeof MEMBER_TABLE.$inferSelect;


export const SCHEDULE_TABLE = sqliteTable("schedule", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	command: text("command").notNull().$type<ScheduleCommand | null>(),
	cron: text("cron").notNull(),
	timezone: text("timezone").notNull(),
	messageChannelId: text("user_id").$type<Snowflake | null>(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.queueId, table.command, table.cron, table.timezone),
	guildIdIndex: index("schedule_guild_id_index").on(table.guildId),
}));

export const SCHEDULE_RELATIONS = relations(SCHEDULE_TABLE, ({ one }) => ({
	guilds: one(GUILD_TABLE, {
		fields: [SCHEDULE_TABLE.guildId],
		references: [GUILD_TABLE.guildId],
	}),
	queues: one(QUEUE_TABLE, {
		fields: [SCHEDULE_TABLE.guildId],
		references: [QUEUE_TABLE.guildId],
	}),
}));

export type NewSchedule = typeof SCHEDULE_TABLE.$inferInsert;
export type DbSchedule = typeof SCHEDULE_TABLE.$inferSelect;


export const BLACKLISTED_TABLE = sqliteTable("blacklisted", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.queueId, table.subjectId),
	guildIdIndex: index("blacklisted_guild_id_index").on(table.guildId),
}));

export const BLACKLISTED_RELATIONS = relations(BLACKLISTED_TABLE, ({ one }) => ({
	guilds: one(GUILD_TABLE, {
		fields: [BLACKLISTED_TABLE.guildId],
		references: [GUILD_TABLE.guildId],
	}),
	queues: one(QUEUE_TABLE, {
		fields: [BLACKLISTED_TABLE.guildId],
		references: [QUEUE_TABLE.guildId],
	}),
}));

export type NewBlacklisted = typeof BLACKLISTED_TABLE.$inferInsert;
export type DbBlacklisted = typeof BLACKLISTED_TABLE.$inferSelect;


export const WHITELISTED_TABLE = sqliteTable("whitelisted", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.queueId, table.subjectId),
	guildIdIndex: index("whitelisted_guild_id_index").on(table.guildId),
}));

export const WHITELISTED_RELATIONS = relations(WHITELISTED_TABLE, ({ one }) => ({
	guilds: one(GUILD_TABLE, {
		fields: [WHITELISTED_TABLE.guildId],
		references: [GUILD_TABLE.guildId],
	}),
	queues: one(QUEUE_TABLE, {
		fields: [WHITELISTED_TABLE.guildId],
		references: [QUEUE_TABLE.guildId],
	}),
}));

export type NewWhitelisted = typeof WHITELISTED_TABLE.$inferInsert;
export type DbWhitelisted = typeof WHITELISTED_TABLE.$inferSelect;


export const PRIORITIZED_TABLE = sqliteTable("prioritized", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	queueId: integer("queue_id").$type<bigint>().notNull().references(() => QUEUE_TABLE.id, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
	priorityOrder: integer("priority_order").notNull().default(5),
	reason: text("reason"),
}),
(table) => ({
	unq: unique().on(table.guildId, table.subjectId),
	guildIdIndex: index("prioritized_guild_id_index").on(table.guildId),
}));

export const PRIORITIZED_RELATIONS = relations(PRIORITIZED_TABLE, ({ one }) => ({
	guilds: one(GUILD_TABLE, {
		fields: [PRIORITIZED_TABLE.guildId],
		references: [GUILD_TABLE.guildId],
	}),
	queues: one(QUEUE_TABLE, {
		fields: [PRIORITIZED_TABLE.guildId],
		references: [QUEUE_TABLE.guildId],
	}),
}));

export type NewPrioritized = typeof PRIORITIZED_TABLE.$inferInsert;
export type DbPrioritized = typeof PRIORITIZED_TABLE.$inferSelect;


export const ADMIN_TABLE = sqliteTable("admin", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull().references(() => GUILD_TABLE.guildId, { onDelete: "cascade" }),
	subjectId: text("subject_id").$type<Snowflake>().notNull(),
	isRole: integer("is_role", { mode: "boolean" }).notNull(),
}),
(table) => ({
	unq: unique().on(table.guildId, table.subjectId),
	guildIdIndex: index("admin_guild_id_index").on(table.guildId),
}));

export const ADMIN_RELATIONS = relations(ADMIN_TABLE, ({ one }) => ({
	guilds: one(GUILD_TABLE, {
		fields: [ADMIN_TABLE.guildId],
		references: [GUILD_TABLE.guildId],
	}),
}));

export type NewAdmin = typeof ADMIN_TABLE.$inferInsert;
export type DbAdmin = typeof ADMIN_TABLE.$inferSelect;


export const ARCHIVED_MEMBER_TABLE = sqliteTable("archived_member", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	guildId: text("guild_id").notNull(),
	queueId: integer("queue_id").$type<bigint>().notNull(),
	userId: text("user_id").$type<Snowflake>().notNull(),
	message: text("message"),
	positionTime: integer("position_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	joinTime: integer("join_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	archivedTime: integer("archived_time").$type<bigint>().notNull().$defaultFn(() => BigInt(Date.now())),
	reason: text("text").$type<ArchivedMemberReason>().notNull(),
}),
(table) => ({
	unq: unique().on(table.queueId, table.userId),
}));

export type NewArchivedMember = typeof ARCHIVED_MEMBER_TABLE.$inferInsert;
export type DbArchivedMember = typeof ARCHIVED_MEMBER_TABLE.$inferSelect;


export const PATCH_NOTE_TABLE = sqliteTable("patch_note", ({
	id: integer("id").$type<bigint>().primaryKey({ autoIncrement: true }),

	fileName: text("file_name").notNull(),
}));

export type NewPatchNote = typeof PATCH_NOTE_TABLE.$inferInsert;
export type DbPatchNote = typeof PATCH_NOTE_TABLE.$inferSelect;
