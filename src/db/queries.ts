import type { Snowflake } from "discord.js";
import { and, eq, sql } from "drizzle-orm";

import { db } from "./db.ts";
import {
	ADMIN_TABLE,
	ARCHIVED_MEMBER_TABLE,
	BLACKLISTED_TABLE,
	DISPLAY_TABLE,
	GUILD_TABLE,
	MEMBER_TABLE,
	type NewPatchNote,
	PATCH_NOTE_TABLE,
	PRIORITIZED_TABLE,
	QUEUE_TABLE,
	SCHEDULE_TABLE,
	VOICE_TABLE,
	WHITELISTED_TABLE,
} from "./schema.ts";

/**
 * `QueryUtils` is responsible for handling all database read operations, including select queries.
 * These operations do not modify the database but are used to retrieve data.
 * All database write operations (insert, update, delete) are handled in `store.ts` to ensure they update the cache.
 *
 * ⚠️ IMPORTANT ⚠️: Queries must be written to include guildId!
 */
export namespace Queries {

	// ====================================================================
	//                           Queries
	// ====================================================================

	// Guilds

	export function selectGuild(by: { guildId: Snowflake }) {
		return selectGuildById.get(by);
	}

	export function deleteGuild(by: { guildId: Snowflake }) {
		return db
			.delete(GUILD_TABLE)
			.where(
				eq(GUILD_TABLE.guildId, by.guildId)
			)
			.returning().get();
	}

	// Queues

	export function selectQueue(by: { guildId: Snowflake, id: bigint }) {
		return selectQueueGuildIdAndById.get(by);
	}

	export function selectManyQueues(by: { guildId: Snowflake }) {
		return selectManyQueuesByGuildId.all(by);
	}

	// Voice

	export function selectVoice(by: { guildId: Snowflake, id: bigint }) {
		return selectVoiceByGuildIdAndId.get(by);
	}

	export function selectManyVoices(by: { guildId: Snowflake }) {
		return selectManyVoicesByGuildId.all(by);
	}

	export function selectAllVoices() {
		return db
			.select()
			.from(VOICE_TABLE)
			.all();
	}

	// Displays

	export function selectDisplay(by:
		{ guildId: Snowflake, id: bigint } |
		{ guildId: Snowflake, lastMessageId: Snowflake } |
		{ guildId: Snowflake, queueId: bigint, displayChannelId: Snowflake }
	) {
		if ("id" in by) {
			return selectDisplayById.get(by);
		}
		else if ("lastMessageId" in by) {
			return selectDisplayByLastMessageId.get(by);
		}
		else if ("queueId" in by && "displayChannelId" in by) {
			return selectDisplayByQueueIdAndDisplayChannelId.get(by);
		}
	}

	export function selectManyDisplays(by:
		 { guildId: Snowflake, queueId?: bigint } |
		 { guildId: Snowflake, displayChannelId?: Snowflake }
	) {
		if ("queueId" in by) {
			return selectManyDisplaysByGuildIdAndQueueId.all(by);
		}
		else if ("displayChannelId" in by) {
			return selectManyDisplaysByGuildIdAndDisplayChannelId.all(by);
		}
		else {
			return selectManyDisplaysByGuildId.all(by);
		}
	}

	// Members

	export function selectMember(by:
		{ guildId: Snowflake, id: bigint } |
		{ guildId: Snowflake, queueId: bigint, userId?: Snowflake }
	) {
		if ("id" in by) {
			return selectMemberByGuildIdAndId.get(by);
		}
		else if ("queueId" in by && "userId" in by) {
			return selectMemberByGuildIdAndQueueIdAndUserId.get(by);
		}
		else if ("queueId" in by) {
			return selectNextMemberByGuildIdAndQueueId.get(by);
		}
	}

	/**
	 * Selects members in position order
	 */
	export function selectManyMembers(by:
		{ guildId: Snowflake, userId?: Snowflake } |
		{ guildId: Snowflake, queueId: bigint, count?: number }
	) {
		if ("userId" in by) {
			return selectManyMembersByGuildIdAndUserId.all(by);
		}
		else if ("queueId" in by && "count" in by) {
			return selectManyMembersByGuildIdAndQueueIdAndCount.all(by);
		}
		else if ("queueId" in by) {
			return selectManyMembersByGuildIdAndQueueId.all(by);
		}
		else {
			return selectManyMembersByGuildId.all(by);
		}
	}

	// Schedules

	// Must allow by without guildId for automatic schedule running
	export function selectSchedule(by: { id: bigint }) {
		return selectScheduleByGuildIdAndId.get(by);
	}

	export function selectManySchedules(by: { guildId: Snowflake, queueId?: bigint }) {
		if ("queueId" in by) {
			return selectManySchedulesByGuildIdAndQueueId.all(by);
		}
		else {
			return selectManySchedulesByGuildId.all(by);
		}
	}

	// Needed for startup schedule load
	export function selectAllSchedules() {
		return db
			.select()
			.from(SCHEDULE_TABLE)
			.all();
	}

	export function deleteSchedule(by: { guildId: Snowflake, id: bigint }) {
		return db
			.delete(SCHEDULE_TABLE)
			.where(and(
				eq(SCHEDULE_TABLE.guildId, by.guildId),
				eq(SCHEDULE_TABLE.id, by.id)
			))
			.returning().get();
	}

	// Whitelisted

	export function selectWhitelisted(by:
		{ guildId: Snowflake, id: bigint } |
		{ guildId: Snowflake, queueId: bigint, subjectId: Snowflake }
	) {
		if ("id" in by) {
			return selectWhitelistedByGuildIdAndId.get(by);
		}
		else if ("queueId" in by && "subjectId" in by) {
			return selectWhitelistedByGuildIdAndQueueIdAndSubjectId.get(by);
		}
	}

	export function selectManyWhitelisted(by:
		{ guildId: Snowflake, subjectId?: Snowflake } |
		{ guildId: Snowflake, queueId?: bigint }
	) {
		if ("subjectId" in by) {
			return selectManyWhitelistedByGuildIdAndSubjectId.all(by);
		}
		else if ("queueId" in by) {
			return selectManyWhitelistedByGuildIdAndQueueId.all(by);
		}
		else if ("guildId" in by) {
			return selectManyWhitelistedByGuildId.all(by);
		}
	}

	// Blacklisted

	export function selectBlacklisted(by:
		{ guildId: Snowflake, id: bigint } |
		{ guildId: Snowflake, queueId: bigint, subjectId: Snowflake }
	) {
		if ("id" in by) {
			return selectBlacklistedByGuildIdAndId.get(by);
		}
		else if ("queueId" in by && "subjectId" in by) {
			return selectBlacklistedByGuildIdAndQueueIdAndSubjectId.get(by);
		}
	}

	export function selectManyBlacklisted(by:
		{ guildId: Snowflake, subjectId?: Snowflake } |
		{ guildId: Snowflake, queueId?: bigint }
	) {
		if ("subjectId" in by) {
			return selectManyBlacklistedByGuildIdAndSubjectId.all(by);
		}
		else if ("queueId" in by) {
			return selectManyBlacklistedByGuildIdAndQueueId.all(by);
		}
		else if ("guildId" in by) {
			return selectManyBlacklistedByGuildId.all(by);
		}
	}

	// Prioritized

	export function selectPrioritized(by:
		{ guildId: Snowflake, id: bigint } |
		{ guildId: Snowflake, queueId: bigint, subjectId: Snowflake }
	) {
		if ("id" in by) {
			return selectPrioritizedByGuildIdAndId.get(by);
		}
		else if ("queueId" in by && "subjectId" in by) {
			return selectPrioritizedByGuildIdAndQueueIdAndSubjectId.get(by);
		}
	}

	export function selectManyPrioritized(by:
		{ guildId: Snowflake, subjectId?: Snowflake } |
		{ guildId: Snowflake, queueId?: bigint }
	) {
		if ("subjectId" in by) {
			return selectManyPrioritizedByGuildIdAndSubjectId.all(by);
		}
		else if ("queueId" in by) {
			return selectManyPrioritizedByGuildIdAndQueueId.all(by);
		}
		else if ("guildId" in by) {
			return selectManyPrioritizedByGuildId.all(by);
		}
	}

	// Admins

	export function selectAdmin(by:
		{ guildId: Snowflake, id: bigint } |
		{ guildId: Snowflake, subjectId: Snowflake }
	) {
		if ("id" in by) {
			return selectAdminById.get(by);
		}
		else if ("subjectId" in by) {
			return selectAdminByGuildIdAndSubjectId.get(by);
		}
	}

	export function selectManyAdmins(by: { guildId: Snowflake, subjectId?: Snowflake }) {
		if ("subjectId" in by) {
			return selectManyAdminsByGuildIdAndSubjectId.all(by);
		}
		else {
			return selectManyAdminsByGuildId.all(by);
		}
	}

	// Archived Members

	export function selectArchivedMember(by:
		 { guildId: Snowflake, id: bigint } |
		 { guildId: Snowflake, queueId: bigint, userId: Snowflake }
	) {
		if ("id" in by) {
			return selectArchivedMemberByGuildIdAndId.get(by);
		}
		else if ("queueId" in by && "userId" in by) {
			return selectArchivedMemberByGuildIdAndQueueIdAndUserId.get(by);
		}
	}

	export function selectManyArchivedMembers(by:
		{ guildId: Snowflake, userId?: Snowflake } |
		{ guildId: Snowflake, queueId?: bigint }
	) {
		if ("userId" in by) {
			return selectManyArchivedMembersByGuildIdAndUserId.all(by);
		}
		else if ("queueId" in by) {
			return selectManyArchivedMembersByGuildIdAndQueueId.all(by);
		}
		else {
			return selectManyArchivedMembersByGuildId.all(by);
		}
	}

	// Patch Notes

	export function selectAllPatchNotes() {
		return db
			.select()
			.from(PATCH_NOTE_TABLE)
			.all();
	}

	export function insertPatchNotes(patchNote: NewPatchNote) {
		return db
			.insert(PATCH_NOTE_TABLE)
			.values(patchNote)
			.returning().get();
	}


	// ====================================================================
	//                           Prepared Selects
	// ====================================================================

	// Guilds

	const selectGuildById = db
		.select()
		.from(GUILD_TABLE)
		.where(
			eq(GUILD_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	// Queues

	const selectQueueGuildIdAndById = db
		.select()
		.from(QUEUE_TABLE)
		.where(and(
			eq(QUEUE_TABLE.guildId, sql.placeholder("guildId")),
			eq(QUEUE_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectManyQueuesByGuildId = db
		.select()
		.from(QUEUE_TABLE)
		.where(
			eq(QUEUE_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	// Voice

	const selectVoiceByGuildIdAndId = db
		.select()
		.from(VOICE_TABLE)
		.where(and(
			eq(VOICE_TABLE.guildId, sql.placeholder("guildId")),
			eq(VOICE_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectManyVoicesByGuildId = db
		.select()
		.from(VOICE_TABLE)
		.where(
			eq(VOICE_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	// Displays

	const selectDisplayById = db
		.select()
		.from(DISPLAY_TABLE)
		.where(and(
			eq(DISPLAY_TABLE.guildId, sql.placeholder("guildId")),
			eq(DISPLAY_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectDisplayByLastMessageId = db
		.select()
		.from(DISPLAY_TABLE)
		.where(and(
			eq(DISPLAY_TABLE.guildId, sql.placeholder("guildId")),
			eq(DISPLAY_TABLE.lastMessageId, sql.placeholder("lastMessageId"))
		))
		.prepare();

	const selectDisplayByQueueIdAndDisplayChannelId = db
		.select()
		.from(DISPLAY_TABLE)
		.where(and(
			eq(DISPLAY_TABLE.guildId, sql.placeholder("guildId")),
			eq(DISPLAY_TABLE.queueId, sql.placeholder("queueId")),
			eq(DISPLAY_TABLE.displayChannelId, sql.placeholder("displayChannelId"))
		))
		.prepare();

	const selectManyDisplaysByGuildId = db
		.select()
		.from(DISPLAY_TABLE)
		.where(
			eq(DISPLAY_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	const selectManyDisplaysByGuildIdAndQueueId = db
		.select()
		.from(DISPLAY_TABLE)
		.where(and(
			eq(DISPLAY_TABLE.guildId, sql.placeholder("guildId")),
			eq(DISPLAY_TABLE.queueId, sql.placeholder("queueId"))
		))
		.prepare();

	const selectManyDisplaysByGuildIdAndDisplayChannelId = db
		.select()
		.from(DISPLAY_TABLE)
		.where(and(
			eq(DISPLAY_TABLE.guildId, sql.placeholder("guildId")),
			eq(DISPLAY_TABLE.displayChannelId, sql.placeholder("displayChannelId"))
		))
		.prepare();

	// Members

	const MEMBER_ORDER = [
		// Raw SQL for CASE statement to handle NULL values
		sql`CASE WHEN ${MEMBER_TABLE.priorityOrder} IS NULL THEN 1 ELSE 0 END`,
		MEMBER_TABLE.priorityOrder,
		MEMBER_TABLE.positionTime,
	];

	const selectMemberByGuildIdAndId = db
		.select()
		.from(MEMBER_TABLE)
		.where(and(
			eq(MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(MEMBER_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectMemberByGuildIdAndQueueIdAndUserId = db
		.select()
		.from(MEMBER_TABLE)
		.where(and(
			eq(MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(MEMBER_TABLE.queueId, sql.placeholder("queueId")),
			eq(MEMBER_TABLE.userId, sql.placeholder("userId"))
		))
		.prepare();

	const selectNextMemberByGuildIdAndQueueId = db
		.select()
		.from(MEMBER_TABLE)
		.where(and(
			eq(MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(MEMBER_TABLE.queueId, sql.placeholder("queueId"))
		))
		.orderBy(...MEMBER_ORDER)
		.prepare();

	const selectManyMembersByGuildIdAndUserId = db
		.select()
		.from(MEMBER_TABLE)
		.where(and(
			eq(MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(MEMBER_TABLE.userId, sql.placeholder("userId"))
		))
		.orderBy(...MEMBER_ORDER)
		.prepare();

	const selectManyMembersByGuildId = db
		.select()
		.from(MEMBER_TABLE)
		.where(
			eq(MEMBER_TABLE.guildId, sql.placeholder("guildId"))
		)
		.orderBy(...MEMBER_ORDER)
		.prepare();

	const selectManyMembersByGuildIdAndQueueIdAndCount = db
		.select()
		.from(MEMBER_TABLE)
		.where(and(
			eq(MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(MEMBER_TABLE.queueId, sql.placeholder("queueId"))
		))
		.orderBy(...MEMBER_ORDER)
		.limit(sql.placeholder("count"))
		.prepare();

	const selectManyMembersByGuildIdAndQueueId = db
		.select()
		.from(MEMBER_TABLE)
		.where(and(
			eq(MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(MEMBER_TABLE.queueId, sql.placeholder("queueId"))
		))
		.orderBy(...MEMBER_ORDER)
		.prepare();

	// Schedules

	const selectScheduleByGuildIdAndId = db
		.select()
		.from(SCHEDULE_TABLE)
		.where(
			eq(SCHEDULE_TABLE.id, sql.placeholder("id"))
		)
		.prepare();

	const selectManySchedulesByGuildId = db
		.select()
		.from(SCHEDULE_TABLE)
		.where(
			eq(SCHEDULE_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	const selectManySchedulesByGuildIdAndQueueId = db
		.select()
		.from(SCHEDULE_TABLE)
		.where(and(
			eq(SCHEDULE_TABLE.guildId, sql.placeholder("guildId")),
			eq(SCHEDULE_TABLE.queueId, sql.placeholder("queueId"))
		))
		.prepare();

	// Whitelisted

	const selectWhitelistedByGuildIdAndId = db
		.select()
		.from(WHITELISTED_TABLE)
		.where(and(
			eq(WHITELISTED_TABLE.guildId, sql.placeholder("guildId")),
			eq(WHITELISTED_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectWhitelistedByGuildIdAndQueueIdAndSubjectId = db
		.select()
		.from(WHITELISTED_TABLE)
		.where(and(
			eq(WHITELISTED_TABLE.guildId, sql.placeholder("guildId")),
			eq(WHITELISTED_TABLE.queueId, sql.placeholder("queueId")),
			eq(WHITELISTED_TABLE.subjectId, sql.placeholder("subjectId"))
		))
		.prepare();

	const selectManyWhitelistedByGuildIdAndSubjectId = db
		.select()
		.from(WHITELISTED_TABLE)
		.where(and(
			eq(WHITELISTED_TABLE.guildId, sql.placeholder("guildId")),
			eq(WHITELISTED_TABLE.subjectId, sql.placeholder("subjectId"))
		))
		.prepare();

	const selectManyWhitelistedByGuildId = db
		.select()
		.from(WHITELISTED_TABLE)
		.where(
			eq(WHITELISTED_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	const selectManyWhitelistedByGuildIdAndQueueId = db
		.select()
		.from(WHITELISTED_TABLE)
		.where(and(
			eq(WHITELISTED_TABLE.guildId, sql.placeholder("guildId")),
			eq(WHITELISTED_TABLE.queueId, sql.placeholder("queueId"))
		))
		.prepare();

	// Blacklisted

	const selectBlacklistedByGuildIdAndId = db
		.select()
		.from(BLACKLISTED_TABLE)
		.where(and(
			eq(BLACKLISTED_TABLE.guildId, sql.placeholder("guildId")),
			eq(BLACKLISTED_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectBlacklistedByGuildIdAndQueueIdAndSubjectId = db
		.select()
		.from(BLACKLISTED_TABLE)
		.where(and(
			eq(BLACKLISTED_TABLE.guildId, sql.placeholder("guildId")),
			eq(BLACKLISTED_TABLE.queueId, sql.placeholder("queueId")),
			eq(BLACKLISTED_TABLE.subjectId, sql.placeholder("subjectId"))
		))
		.prepare();

	const selectManyBlacklistedByGuildIdAndSubjectId = db
		.select()
		.from(BLACKLISTED_TABLE)
		.where(and(
			eq(BLACKLISTED_TABLE.guildId, sql.placeholder("guildId")),
			eq(BLACKLISTED_TABLE.subjectId, sql.placeholder("subjectId"))
		))
		.prepare();

	const selectManyBlacklistedByGuildId = db
		.select()
		.from(BLACKLISTED_TABLE)
		.where(
			eq(BLACKLISTED_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	const selectManyBlacklistedByGuildIdAndQueueId = db
		.select()
		.from(BLACKLISTED_TABLE)
		.where(and(
			eq(BLACKLISTED_TABLE.guildId, sql.placeholder("guildId")),
			eq(BLACKLISTED_TABLE.queueId, sql.placeholder("queueId"))
		))
		.prepare();

	// Prioritized

	const selectPrioritizedByGuildIdAndId = db
		.select()
		.from(PRIORITIZED_TABLE)
		.where(and(
			eq(PRIORITIZED_TABLE.guildId, sql.placeholder("guildId")),
			eq(PRIORITIZED_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectPrioritizedByGuildIdAndQueueIdAndSubjectId = db
		.select()
		.from(PRIORITIZED_TABLE)
		.where(and(
			eq(PRIORITIZED_TABLE.guildId, sql.placeholder("guildId")),
			eq(PRIORITIZED_TABLE.queueId, sql.placeholder("queueId")),
			eq(PRIORITIZED_TABLE.subjectId, sql.placeholder("subjectId"))
		))
		.prepare();

	const selectManyPrioritizedByGuildId = db
		.select()
		.from(PRIORITIZED_TABLE)
		.where(
			eq(PRIORITIZED_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	const selectManyPrioritizedByGuildIdAndSubjectId = db
		.select()
		.from(PRIORITIZED_TABLE)
		.where(and(
			eq(PRIORITIZED_TABLE.guildId, sql.placeholder("guildId")),
			eq(PRIORITIZED_TABLE.subjectId, sql.placeholder("subjectId"))
		))
		.prepare();

	const selectManyPrioritizedByGuildIdAndQueueId = db
		.select()
		.from(PRIORITIZED_TABLE)
		.where(and(
			eq(PRIORITIZED_TABLE.guildId, sql.placeholder("guildId")),
			eq(PRIORITIZED_TABLE.queueId, sql.placeholder("queueId"))
		))
		.prepare();

	// Admins

	const selectAdminById = db
		.select()
		.from(ADMIN_TABLE)
		.where(and(
			eq(ADMIN_TABLE.guildId, sql.placeholder("guildId")),
			eq(ADMIN_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectAdminByGuildIdAndSubjectId = db
		.select()
		.from(ADMIN_TABLE)
		.where(and(
			eq(ADMIN_TABLE.guildId, sql.placeholder("guildId")),
			eq(ADMIN_TABLE.subjectId, sql.placeholder("subjectId"))
		))
		.prepare();

	const selectManyAdminsByGuildIdAndSubjectId = db
		.select()
		.from(ADMIN_TABLE)
		.where(and(
			eq(ADMIN_TABLE.guildId, sql.placeholder("guildId")),
			eq(ADMIN_TABLE.subjectId, sql.placeholder("subjectId"))
		))
		.prepare();

	const selectManyAdminsByGuildId = db
		.select()
		.from(ADMIN_TABLE)
		.where(
			eq(ADMIN_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	// Archived Members

	const selectArchivedMemberByGuildIdAndId = db
		.select()
		.from(ARCHIVED_MEMBER_TABLE)
		.where(and(
			eq(ARCHIVED_MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(ARCHIVED_MEMBER_TABLE.id, sql.placeholder("id"))
		))
		.prepare();

	const selectArchivedMemberByGuildIdAndQueueIdAndUserId = db
		.select()
		.from(ARCHIVED_MEMBER_TABLE)
		.where(and(
			eq(ARCHIVED_MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(ARCHIVED_MEMBER_TABLE.queueId, sql.placeholder("queueId")),
			eq(ARCHIVED_MEMBER_TABLE.userId, sql.placeholder("userId"))
		))
		.prepare();

	const selectManyArchivedMembersByGuildIdAndUserId = db
		.select()
		.from(ARCHIVED_MEMBER_TABLE)
		.where(and(
			eq(ARCHIVED_MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(ARCHIVED_MEMBER_TABLE.userId, sql.placeholder("userId"))
		))
		.prepare();

	const selectManyArchivedMembersByGuildId = db
		.select()
		.from(ARCHIVED_MEMBER_TABLE)
		.where(
			eq(ARCHIVED_MEMBER_TABLE.guildId, sql.placeholder("guildId"))
		)
		.prepare();

	const selectManyArchivedMembersByGuildIdAndQueueId = db
		.select()
		.from(ARCHIVED_MEMBER_TABLE)
		.where(and(
			eq(ARCHIVED_MEMBER_TABLE.guildId, sql.placeholder("guildId")),
			eq(ARCHIVED_MEMBER_TABLE.queueId, sql.placeholder("queueId"))
		))
		.prepare();
}
