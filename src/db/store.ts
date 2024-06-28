import {
	type DiscordAPIError,
	Guild,
	type GuildBasedChannel,
	type GuildMember,
	type Role,
	type Snowflake,
} from "discord.js";
import { and, eq, isNull, or } from "drizzle-orm";
import { compact, isNil, omitBy } from "lodash-es";
import moize from "moize";

import { type GuildStat, MemberRemovalReason, type Scope } from "../types/db.types.ts";
import type { AnyInteraction, ButtonInteraction, SlashInteraction } from "../types/interaction.types.ts";
import {
	AdminAlreadyExistsError,
	BlacklistedAlreadyExistsError,
	PrioritizedAlreadyExistsError,
	QueueAlreadyExistsError,
	ScheduleAlreadyExistsError,
	WhitelistedAlreadyExistsError,
} from "../utils/error.utils.ts";
import { toCollection } from "../utils/misc.utils.ts";
import { db } from "./db.ts";
import { incrementGuildStat as _incrementGuildStat } from "./db-scheduled-tasks.ts";
import { Queries } from "./queries.ts";
import {
	ADMIN_TABLE,
	ARCHIVED_MEMBER_TABLE,
	BLACKLISTED_TABLE,
	type DbAdmin,
	type DbArchivedMember,
	type DbBlacklisted,
	type DbDisplay,
	type DbMember,
	type DbPrioritized,
	type DbQueue,
	type DbSchedule,
	type DbVoice,
	type DbWhitelisted,
	DISPLAY_TABLE,
	GUILD_TABLE,
	MEMBER_TABLE,
	type NewAdmin,
	type NewArchivedMember,
	type NewBlacklisted,
	type NewDisplay,
	type NewGuild,
	type NewMember,
	type NewPrioritized,
	type NewQueue,
	type NewSchedule,
	type NewVoice,
	type NewWhitelisted,
	PRIORITIZED_TABLE,
	QUEUE_TABLE,
	SCHEDULE_TABLE,
	VOICE_TABLE,
	WHITELISTED_TABLE,
} from "./schema.ts";

/**
 * The `Store` class is responsible for all database operations initiated by users, including insert, update, and delete operations.
 * Select queries are encapsulated in `query.utils.ts` to promote code reusability across different parts of the application.
 *
 * ⚠️ IMPORTANT ⚠️: Queries must be written to include guildId!
 */
export class Store {
	public inter: ButtonInteraction | SlashInteraction;

	constructor(
		public guild: Guild,
		inter?: AnyInteraction,
	) {
		this.inter = inter as ButtonInteraction | SlashInteraction;
	}

	// ====================================================================
	//                           Common data
	// ====================================================================

	dbGuild = moize(() => Queries.selectGuild({ guildId: this.guild.id }) ?? this.insertGuild({ guildId: this.guild.id }));
	dbQueues = moize(() => toCollection<bigint, DbQueue>("id", Queries.selectManyQueues({ guildId: this.guild.id })));
	dbVoices = moize(() => toCollection<bigint, DbVoice>("id", Queries.selectManyVoices({ guildId: this.guild.id })));
	dbDisplays = moize(() => toCollection<bigint, DbDisplay>("id", Queries.selectManyDisplays({ guildId: this.guild.id })));
	// DbMembers is **ordered by positionTime**.
	dbMembers = moize(() => toCollection<bigint, DbMember>("id", Queries.selectManyMembers({ guildId: this.guild.id })));
	dbSchedules = moize(() => toCollection<bigint, DbSchedule>("id", Queries.selectManySchedules({ guildId: this.guild.id })));
	dbWhitelisted = moize(() => toCollection<bigint, DbWhitelisted>("id", Queries.selectManyWhitelisted({ guildId: this.guild.id })));
	dbBlacklisted = moize(() => toCollection<bigint, DbBlacklisted>("id", Queries.selectManyBlacklisted({ guildId: this.guild.id })));
	dbPrioritized = moize(() => toCollection<bigint, DbPrioritized>("id", Queries.selectManyPrioritized({ guildId: this.guild.id })));
	dbAdmins = moize(() => toCollection<bigint, DbAdmin>("id", Queries.selectManyAdmins({ guildId: this.guild.id })));
	// dbArchivedMembers is **unordered**.
	dbArchivedMembers = moize(() => toCollection<bigint, DbArchivedMember>("id", Queries.selectManyArchivedMembers({ guildId: this.guild.id })));

	// ====================================================================
	//                           Discord.js
	// ====================================================================

	async cleanupMissingChannel(channelId: Snowflake) {
		this.deleteManyDisplays({ displayChannelId: channelId });
		this.deleteManyVoices({ sourceChannelId: channelId });
		// Unset instance of the log channel id
		db
			.update(GUILD_TABLE)
			.set({ logChannelId: null })
			.where(and(
				eq(GUILD_TABLE.guildId, this.guild.id),
				eq(GUILD_TABLE.logChannelId, channelId)
			));
	}

	async jsChannel(channelId: Snowflake) {
		try {
			return await this.guild.channels.fetch(channelId);
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status == 404) {
				await this.cleanupMissingChannel(channelId);
			}
			else {
				console.error(e);
			}
		}
	}

	async jsChannels(channelIds: Snowflake[]) {
		return toCollection<Snowflake, GuildBasedChannel>("id",
			compact(await Promise.all(channelIds.map(id => this.jsChannel(id))))
		);
	}

	async jsMember(userId: Snowflake) {
		try {
			return await this.guild.members.fetch(userId);
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status == 404) {
				this.deleteManyMembers({ userId }, MemberRemovalReason.NotFound);
			}
			else {
				console.error(e);
			}
		}
	}

	async jsMembers(userIds: Snowflake[]) {
		return toCollection<Snowflake, GuildMember>("id",
			compact(await Promise.all(userIds.map(id => this.jsMember(id))))
		);
	}

	async jsRole(roleId: Snowflake) {
		try {
			return await this.guild.roles.fetch(roleId);
		}
		catch (e) {
			const { status } = e as DiscordAPIError;
			if (status == 404) {
				this.deleteManyWhitelisted({ subjectId: roleId });
				this.deleteManyBlacklisted({ subjectId: roleId });
				this.deleteManyPrioritized({ subjectId: roleId });
				this.deleteAdmin({ subjectId: roleId });
			}
			else {
				console.error(e);
			}
		}
	}

	async jsRoles(roleIds: Snowflake[]) {
		return toCollection<Snowflake, Role>("id",
			compact(await Promise.all(roleIds.map(id => this.jsRole(id))))
		);
	}

	// ====================================================================
	//                           Inserts
	// ====================================================================

	incrementGuildStat(stat: GuildStat, by = 1) {
		// Ensure the guild is in the database
		this.insertGuild({ guildId: this.guild.id });
		_incrementGuildStat(this.guild.id, stat, by);
	}

	// do nothing on conflict
	insertGuild(dbGuild: NewGuild) {
		return db
			.insert(GUILD_TABLE)
			.values(omitBy(dbGuild, isNil) as NewGuild)
			.onConflictDoNothing()
			.returning().get();
	}

	// throws error on conflict
	insertQueue(newQueue: NewQueue) {
		try {
			this.incrementGuildStat("queuesAdded");
			this.dbQueues.clear();
			return db
				.insert(QUEUE_TABLE)
				.values(omitBy(newQueue, isNil) as NewQueue)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new QueueAlreadyExistsError();
			}
		}
	}

	// replace on conflict
	insertVoice(newVoice: NewVoice) {
		const voice = omitBy(newVoice, isNil) as NewVoice;
		this.incrementGuildStat("voicesAdded");
		this.dbVoices.clear();
		return db
			.insert(VOICE_TABLE)
			.values(voice)
			.onConflictDoUpdate({
				target: [VOICE_TABLE.queueId, VOICE_TABLE.sourceChannelId],
				set: voice,
			})
			.returning().get();
	}

	// replace on conflict
	insertDisplay(newDisplay: NewDisplay) {
		const display = omitBy(newDisplay, isNil) as NewDisplay;
		this.incrementGuildStat("displaysAdded");
		this.dbDisplays.clear();
		return db
			.insert(DISPLAY_TABLE)
			.values(display)
			.onConflictDoUpdate({
				target: [DISPLAY_TABLE.queueId, DISPLAY_TABLE.displayChannelId],
				set: display,
			})
			.returning().get();
	}

	// replace on conflict
	insertMember(newMember: NewMember) {
		const member = omitBy(newMember, isNil) as NewMember;
		this.incrementGuildStat("membersAdded");
		this.dbMembers.clear();
		return db
			.insert(MEMBER_TABLE)
			.values(member)
			.onConflictDoUpdate({
				target: [MEMBER_TABLE.queueId, MEMBER_TABLE.userId],
				set: member,
			})
			.returning().get();
	}

	// throws error on conflict
	insertSchedule(newSchedule: NewSchedule) {
		try {
			this.incrementGuildStat("schedulesAdded");
			this.dbSchedules.clear();
			return db
				.insert(SCHEDULE_TABLE)
				.values(omitBy(newSchedule, isNil) as NewSchedule)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new ScheduleAlreadyExistsError();
			}
		}
	}

	// throws error on conflict
	insertWhitelisted(newWhitelisted: NewWhitelisted) {
		try {
			this.incrementGuildStat("whitelistedAdded");
			this.dbWhitelisted.clear();
			return db
				.insert(WHITELISTED_TABLE)
				.values(omitBy(newWhitelisted, isNil) as NewWhitelisted)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new WhitelistedAlreadyExistsError();
			}
		}
	}

	// throws error on conflict
	insertBlacklisted(newBlacklisted: NewBlacklisted) {
		try {
			this.incrementGuildStat("blacklistedAdded");
			this.dbBlacklisted.clear();
			return db
				.insert(BLACKLISTED_TABLE)
				.values(omitBy(newBlacklisted, isNil) as NewBlacklisted)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new BlacklistedAlreadyExistsError();
			}
		}
	}

	// throws error on conflict
	insertPrioritized(newPrioritized: NewPrioritized) {
		try {
			this.incrementGuildStat("prioritizedAdded");
			this.dbPrioritized.clear();
			return db
				.insert(PRIORITIZED_TABLE)
				.values(omitBy(newPrioritized, isNil) as NewPrioritized)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new PrioritizedAlreadyExistsError();
			}
		}
	}

	// throws error on conflict
	insertAdmin(newAdmin: NewAdmin) {
		try {
			this.incrementGuildStat("adminsAdded");
			this.dbAdmins.clear();
			return db
				.insert(ADMIN_TABLE)
				.values(omitBy(newAdmin, isNil) as NewAdmin)
				.returning().get();
		}
		catch (e) {
			if ((e as Error).message.includes("UNIQUE constraint failed")) {
				throw new AdminAlreadyExistsError();
			}
		}
	}

	// replace on conflict
	insertArchivedMember(newArchivedMember: NewArchivedMember) {
		this.incrementGuildStat("archivedMembersAdded");
		this.dbArchivedMembers.clear();
		return db
			.insert(ARCHIVED_MEMBER_TABLE)
			.values(newArchivedMember)
			.onConflictDoUpdate({
				target: [ARCHIVED_MEMBER_TABLE.queueId, ARCHIVED_MEMBER_TABLE.userId],
				set: { ...newArchivedMember, archivedTime: BigInt(Date.now()) },
			})
			.returning().get();
	}

	// ====================================================================
	//                      Condition helper
	// ====================================================================

	/**
	 * Creates a condition for a query based on the provided parameters.
	 * If there is more than one parameter, the condition will be an `AND` condition.
	 * @param table - The table to create the condition for.
	 * @param params - The parameters to create the condition with.
	 * @param connector - The connector to use for multiple parameters.
	 */
	private createCondition(table: any, params: { [key: string]: any }, connector: "AND" | "OR" = "AND") {
		function createSingleCondition(key: string) {
			const col = table[key];
			const value = params[key];
			return isNil(value) ? isNull(col) : eq(col, value);
		}

		// Add guildId to the params
		params.guildId = this.guild.id;

		if (Object.keys(params).length > 1) {
			if (connector === "AND") {
				return and(...Object.keys(params).map(createSingleCondition));
			}
			else {
				return or(...Object.keys(params).map(createSingleCondition));
			}
		}
		else {
			return createSingleCondition(Object.keys(params)[0]);
		}
	}

	// ====================================================================
	//                           Updates
	// ====================================================================

	updateGuild(guild: { logChannelId: Snowflake, logScope: Scope }) {
		// Ensure the guild is in the database
		this.insertGuild({ guildId: this.guild.id });
		return db
			.update(GUILD_TABLE)
			.set(guild)
			.where(eq(GUILD_TABLE.guildId, this.guild.id))
			.returning().get();
	}

	updateQueue(queue: { id: bigint } & Partial<DbQueue>) {
		this.dbQueues.clear();
		return db
			.update(QUEUE_TABLE)
			.set(queue)
			.where(and(
				eq(QUEUE_TABLE.id, queue.id),
				eq(QUEUE_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateVoice(voice: { id: bigint } & Partial<DbVoice>) {
		this.dbVoices.clear();
		return db
			.update(VOICE_TABLE)
			.set(voice)
			.where(and(
				eq(VOICE_TABLE.id, voice.id),
				eq(VOICE_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateDisplay(display: { id: bigint } & Partial<DbDisplay>) {
		this.dbDisplays.clear();
		return db
			.update(DISPLAY_TABLE)
			.set(display)
			.where(and(
				eq(DISPLAY_TABLE.id, display.id),
				eq(DISPLAY_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateMember(member: { id: bigint } & Partial<DbMember>) {
		this.dbMembers.clear();
		return db
			.update(MEMBER_TABLE)
			.set(member)
			.where(and(
				eq(MEMBER_TABLE.id, member.id),
				eq(MEMBER_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateSchedule(schedule: { id: bigint } & Partial<DbSchedule>) {
		this.dbSchedules.clear();
		return db
			.update(SCHEDULE_TABLE)
			.set(schedule)
			.where(and(
				eq(SCHEDULE_TABLE.id, schedule.id),
				eq(SCHEDULE_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateWhitelisted(whitelisted: { id: bigint } & Partial<DbWhitelisted>) {
		this.dbWhitelisted.clear();
		return db
			.update(WHITELISTED_TABLE)
			.set(whitelisted)
			.where(and(
				eq(WHITELISTED_TABLE.id, whitelisted.id),
				eq(WHITELISTED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updateBlacklisted(blacklisted: { id: bigint } & Partial<DbBlacklisted>) {
		this.dbBlacklisted.clear();
		return db
			.update(BLACKLISTED_TABLE)
			.set(blacklisted)
			.where(and(
				eq(BLACKLISTED_TABLE.id, blacklisted.id),
				eq(BLACKLISTED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	updatePrioritized(prioritized: { id: bigint } & Partial<DbPrioritized>) {
		this.dbPrioritized.clear();
		return db
			.update(PRIORITIZED_TABLE)
			.set(prioritized)
			.where(and(
				eq(PRIORITIZED_TABLE.id, prioritized.id),
				eq(PRIORITIZED_TABLE.guildId, this.guild.id)
			))
			.returning().get();
	}

	// ====================================================================
	//                           Deletes
	// ====================================================================

	deleteQueue(by: { id: bigint }) {
		this.dbQueues.clear();
		const cond = this.createCondition(QUEUE_TABLE, by);
		return db.delete(QUEUE_TABLE).where(cond).returning().get();
	}

	deleteManyQueues() {
		this.dbQueues.clear();
		const cond = this.createCondition(QUEUE_TABLE, {});
		return db.delete(QUEUE_TABLE).where(cond).returning().all();
	}

	deleteVoice(by: { id: bigint }) {
		this.dbVoices.clear();
		const cond = this.createCondition(VOICE_TABLE, by);
		return db.delete(VOICE_TABLE).where(cond).returning().get();
	}

	deleteManyVoices(by:
		{ id: bigint } |
		{ sourceChannelId: Snowflake }
	) {
		this.dbVoices.clear();
		const cond = this.createCondition(VOICE_TABLE, by);
		return db.delete(VOICE_TABLE).where(cond).returning().all();
	}

	deleteDisplay(by:
								{ id: bigint } |
								{ lastMessageId: Snowflake } |
								{ queueId: bigint, displayChannelId: Snowflake }
	) {
		this.dbDisplays.clear();
		const cond = this.createCondition(DISPLAY_TABLE, by);
		return db.delete(DISPLAY_TABLE).where(cond).returning().get();
	}

	deleteManyDisplays(by:
		{ queueId?: bigint } |
		{ displayChannelId?: Snowflake }
	) {
		this.dbDisplays.clear();
		const cond = this.createCondition(DISPLAY_TABLE, by);
		return db.delete(DISPLAY_TABLE).where(cond).returning().all();
	}

	deleteMember(by:
		{ id: bigint } |
		{ queueId: bigint, userId?: Snowflake },
	reason: MemberRemovalReason
	) {
		this.dbMembers.clear();
		const deletedMember = db.transaction(() => {
			if ("userId" in by) {
				const cond = this.createCondition(MEMBER_TABLE, by);
				return db.delete(MEMBER_TABLE).where(cond).returning().get();
			}
			else {
				const member = Queries.selectMember({ ...by, guildId: this.guild.id });
				if (member) {
					return db.delete(MEMBER_TABLE).where(eq(MEMBER_TABLE.id, member.id)).returning().get();
				}
			}
		});

		if (deletedMember) {
			this.insertArchivedMember({ ...deletedMember, reason });
		}

		return deletedMember;
	}

	deleteManyMembers(by:
		{ userId?: Snowflake } |
		{ queueId: bigint, count?: number },
	reason: MemberRemovalReason
	) {
		let deletedMembers: DbMember[];
		db.transaction(() => {
			this.dbMembers.clear();
			const cond = ("count" in by)
				? or(...Queries.selectManyMembers({
					...by,
					guildId: this.guild.id,
				}).map(member => eq(MEMBER_TABLE.id, member.id)))
				: this.createCondition(MEMBER_TABLE, by);
			deletedMembers = db.delete(MEMBER_TABLE).where(cond).returning().all();

			deletedMembers.forEach(deletedMember =>
				this.insertArchivedMember({ ...deletedMember, reason })
			);
		});
		return deletedMembers;
	}

	deleteSchedule(by: { id: bigint }) {
		this.dbSchedules.clear();
		const cond = this.createCondition(SCHEDULE_TABLE, by);
		return db.delete(SCHEDULE_TABLE).where(cond).returning().get();
	}

	deleteManySchedules() {
		this.dbSchedules.clear();
		const cond = this.createCondition(SCHEDULE_TABLE, {});
		return db.delete(SCHEDULE_TABLE).where(cond).returning().all();
	}

	deleteWhitelisted(by:
										{ id: bigint } |
										{ queueId: bigint, subjectId: bigint }
	) {
		this.dbWhitelisted.clear();
		const cond = this.createCondition(WHITELISTED_TABLE, by);
		return db.delete(WHITELISTED_TABLE).where(cond).returning().get();
	}

	deleteManyWhitelisted(by:
												{ subjectId?: Snowflake } |
												{ queueId: bigint }
	) {
		this.dbWhitelisted.clear();
		const cond = this.createCondition(WHITELISTED_TABLE, by);
		return db.delete(WHITELISTED_TABLE).where(cond).returning().all();
	}

	deleteBlacklisted(by:
										{ id: bigint } |
										{ queueId: bigint, subjectId: Snowflake }
	) {
		this.dbBlacklisted.clear();
		const cond = this.createCondition(BLACKLISTED_TABLE, by);
		return db.delete(BLACKLISTED_TABLE).where(cond).returning().get();
	}

	deleteManyBlacklisted(by:
												{ subjectId?: Snowflake } |
												{ queueId: bigint }
	) {
		this.dbBlacklisted.clear();
		const cond = this.createCondition(BLACKLISTED_TABLE, by);
		return db.delete(BLACKLISTED_TABLE).where(cond).returning().get();
	}

	deletePrioritized(by:
										{ id: bigint } |
										{ queueId: bigint, subjectId: bigint }
	) {
		this.dbPrioritized.clear();
		const cond = this.createCondition(PRIORITIZED_TABLE, by);
		return db.delete(PRIORITIZED_TABLE).where(cond).returning().get();
	}

	deleteManyPrioritized(by:
												{ subjectId?: Snowflake } |
												{ queueId: bigint }
	) {
		this.dbPrioritized.clear();
		const cond = this.createCondition(PRIORITIZED_TABLE, by);
		return db.delete(PRIORITIZED_TABLE).where(cond).returning().get();
	}

	deleteAdmin(by:
							{ id: bigint } |
							{ subjectId: Snowflake }
	) {
		this.dbAdmins.clear();
		const cond = this.createCondition(ADMIN_TABLE, by);
		return db.delete(ADMIN_TABLE).where(cond).returning().get();
	}

	deleteManyAdmins() {
		this.dbAdmins.clear();
		const cond = this.createCondition(ADMIN_TABLE, {});
		return db.delete(ADMIN_TABLE).where(cond).returning().get();
	}
}
