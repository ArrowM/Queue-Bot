import {
	channelMention,
	Collection,
	EmbedBuilder,
	GuildMember,
	type GuildTextBasedChannel,
	Role,
	roleMention,
	type Snowflake,
} from "discord.js";
import { isNil, shuffle, upperFirst } from "lodash-es";

import { db } from "../db/db.ts";
import { Queries } from "../db/queries.ts";
import { type DbArchivedMember, type DbMember, type DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import { MemberRemovalReason } from "../types/db.types.ts";
import type { MemberDeleteBy } from "../types/member.types.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import { NotificationAction } from "../types/notification.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { BlacklistUtils } from "./blacklist.utils.ts";
import { DisplayUtils } from "./display.utils.ts";
import {
	CustomError,
	NotOnQueueWhitelistError,
	OnQueueBlacklistError,
	QueueFullError,
	QueueLockedError,
} from "./error.utils.ts";
import { LoggingUtils } from "./message-utils/logging.utils.ts";
import { map } from "./misc.utils.ts";
import { NotificationUtils } from "./notification.utils.ts";
import { PriorityUtils } from "./priority.utils.ts";
import { membersMention, queueMention, timeMention } from "./string.utils.ts";
import { WhitelistUtils } from "./whitelist.utils.ts";

export namespace MemberUtils {
	export async function insertMentionables(options: {
		store: Store
		mentionables: Mentionable[],
		queues: Collection<bigint, DbQueue>,
		force?: boolean,
	}) {
		const { store, mentionables, queues, force } = options;

		const insertedMembers = [];
		for (const mentionable of mentionables) {
			if (mentionable instanceof GuildMember) {
				for (const queue of queues.values()) {
					insertedMembers.push(
						await insertJsMember({ store, queue, jsMember: mentionable, force })
					);
				}
			}
			else if (mentionable instanceof Role) {
				const role = await store.jsRole(mentionable.id);
				for (const queue of queues.values()) {
					for (const jsMember of role.members.values()) {
						insertedMembers.push(
							await insertJsMember({ store, queue, jsMember, force })
						);
					}
				}
			}
		}
		return insertedMembers;
	}

	export async function insertJsMember(options: {
		store: Store,
		queue: DbQueue,
		jsMember: GuildMember,
		message?: string,
		force?: boolean,
	}) {
		const { store, queue, jsMember, message, force } = options;

		return await db.transaction(async () => {
			const archivedMember = store.dbArchivedMembers().find(member => member.queueId === queue.id && member.userId === jsMember.id);

			if (!force) {
				verifyMemberEligibility(store, queue, jsMember, archivedMember);
			}

			const priorityOrder = PriorityUtils.getMemberPriority(store, queue.id, jsMember);
			let positionTime = BigInt(Date.now());

			if (queue.rejoinGracePeriod && archivedMember?.reason === MemberRemovalReason.Left) {
				if (BigInt(Date.now()) - archivedMember.archivedTime <= queue.rejoinGracePeriod) {
					// Reuse the positionTime
					positionTime = archivedMember.positionTime;
				}
			}

			const insertedMember = store.insertMember({
				guildId: store.guild.id,
				queueId: queue.id,
				userId: jsMember.id,
				message,
				priorityOrder,
				positionTime,
			});

			await modifyMemberRoles(store, jsMember.id, queue.roleInQueueId, "add");

			DisplayUtils.requestDisplayUpdate(store, queue.id);

			return insertedMember;
		});
	}

	export function updateMembers(store: Store, members: ArrayOrCollection<bigint, DbMember>, message: string) {
		const updatedMembers = map(members, member => store.updateMember({ ...member, message }));
		DisplayUtils.requestDisplaysUpdate(store, map(updatedMembers, member => member.queueId));
		return updatedMembers;
	}

	/**
	 * Deletes members from the queue(s) and optionally notifies them.
	 * @param options.store - The store to use.
	 * @param options.queues - The queue(s) to delete members from.
	 * @param options.reason - The reason for deleting the members.
	 * @param options.by - Optionally specify the members to delete.
	 * @param options.messageChannelId - Optionally specify a channel to send a kick/pull message in
	 * @param options.force - Optionally force the deletion of members.
	 */
	export async function deleteMembers(options: {
		store: Store,
		queues: ArrayOrCollection<bigint, DbQueue>,
		reason: MemberRemovalReason,
		by?: MemberDeleteBy,
		messageChannelId?: Snowflake;
		destinationChannelId?: Snowflake;
		force?: boolean,
	}) {
		const { store, reason, by, messageChannelId, force } = options;
		const queues = options.queues instanceof Collection ? [...options.queues.values()] : options.queues;
		const { userId, userIds, roleId, count } = by ?? {} as any;
		const deletedMembers: DbMember[] = [];

		async function deleteMembersAndNotify(queue: DbQueue, userIds: Snowflake[], reason: MemberRemovalReason) {
			const deleted: DbMember[] = userIds
				.map(userId => store.deleteMember({ queueId: queue.id, userId }, reason))
				.filter(Boolean);

			userIds.forEach(userId => modifyMemberRoles(store, userId, queue.roleInQueueId, "remove").catch(() => null));

			// Pull members to the destination channel if they are in a voice channel
			if (reason === MemberRemovalReason.Pulled) {
				const destinationChannelId = options.destinationChannelId ?? queue.voiceDestinationChannelId;
				if (destinationChannelId) {
					for (const userId of userIds) {
						const jsMember = await store.jsMember(userId);
						if (jsMember.voice && jsMember.voice.channelId !== destinationChannelId) {
							jsMember.voice?.setChannel(destinationChannelId).catch(() => null);
						}
					}
				}
				if (queue.roleOnPullId) {
					userIds.forEach(userId => modifyMemberRoles(store, userId, queue.roleOnPullId, "add").catch(() => null));
				}
			}

			if ([MemberRemovalReason.Pulled, MemberRemovalReason.Kicked].includes(reason)) {
				// Notify of pull or kick
				const action = (reason === MemberRemovalReason.Pulled)
					? NotificationAction.PULLED_FROM_QUEUE
					: NotificationAction.KICKED_FROM_QUEUE;
				let messageLink;
				if (messageChannelId) {
					const messageChannel = await store.jsChannel(messageChannelId) as GuildTextBasedChannel;
					if (messageChannel) {
						const embed = await describePulledMembers(store, queue, deleted, reason);
						const message = await messageChannel?.send({ embeds: [embed] });
						LoggingUtils.log(store, true, message).catch(() => null);
						messageLink = message.url;
					}
				}
				if (queue.notificationsToggle) {
					await NotificationUtils.dmToMembers({ store, queue, action, members: deleted, messageLink });
				}
			}

			DisplayUtils.requestDisplayUpdate(store, queue.id);

			deletedMembers.push(...deleted);
		}

		await db.transaction(async () => {
			if (!isNil(userId) || !isNil(userIds)) {
				const ids: Snowflake[] = !isNil(userId) ? [userId] : userIds;
				for (const queue of queues) {
					await deleteMembersAndNotify(queue, ids, reason);
				}
			}
			else if (!isNil(roleId)) {
				const jsMembers = store.guild.roles.cache.get(roleId).members;
				for (const queue of queues) {
					await deleteMembersAndNotify(queue, jsMembers.map(member => member.id), reason);
				}
			}
			else {
				for (const queue of queues) {
					const numToPull = Number(count ?? queue.pullBatchSize);
					const members = [...store.dbMembers().filter(member => member.queueId === queue.id).values()];
					if (!force && members.length && (members.length < numToPull)) throw new Error("Not enough members to pull");
					const userIdsToPull = members.slice(0, numToPull).map(member => member.userId);
					await deleteMembersAndNotify(queue, userIdsToPull, reason);
				}
			}
		});

		return deletedMembers;
	}

	// Position is 0 indexed
	export function moveMember(store: Store, queue: DbQueue, member: DbMember, position: number) {
		// Validate position
		const members = [...store.dbMembers().filter(member => member.queueId === queue.id).values()];

		if (position < 1 || position > members.length) {
			throw new CustomError({
				message: "Invalid position",
				embeds: [new EmbedBuilder().setDescription(`Position must be between 1 and ${members.length}.`)],
			});
		}

		return db.transaction(() => {
			const positions = members.map(m => m.positionTime);
			const newPosition = position - 1;
			const oldPosition = positions.indexOf(member.positionTime);

			if (oldPosition > newPosition) {
				members.splice(oldPosition, 1);
				members.splice(newPosition, 0, member);
				members.forEach((member, i) =>
					store.updateMember({ ...member, positionTime: positions[i] })
				);
			}
			else if (oldPosition < newPosition) {
				members.splice(oldPosition, 1);
				members.splice(newPosition - 1, 0, member);
				members.forEach((member, i) =>
					store.updateMember({ ...member, positionTime: positions[i] })
				);
			}

			DisplayUtils.requestDisplayUpdate(store, queue.id);

			return members;
		});
	}

	export async function clearMembers(store: Store, queue: DbQueue, messageChannelId: Snowflake) {
		const members = store.deleteManyMembers({ queueId: queue.id }, MemberRemovalReason.Kicked);

		DisplayUtils.requestDisplayUpdate(store, queue.id);

		if (messageChannelId) {
			const messageChannel = await store.jsChannel(messageChannelId) as GuildTextBasedChannel;
			if (messageChannel) {
				const message = await messageChannel?.send(`Cleared the ${queueMention(queue)} queue.`).catch(() => null);
				LoggingUtils.log(store, true, message).catch(() => null);
			}
		}

		return members;
	}

	export async function shuffleMembers(store: Store, queue: DbQueue, messageChannelId: Snowflake) {
		return db.transaction(async () => {
			const members = store.dbMembers().filter(member => member.queueId === queue.id);
			const shuffledPositionTimes = shuffle(members.map(member => member.positionTime));

			members.forEach((member) => store.updateMember({ ...member, positionTime: shuffledPositionTimes.pop() }));

			DisplayUtils.requestDisplayUpdate(store, queue.id);

			if (messageChannelId) {
				const messageChannel = await store.jsChannel(messageChannelId) as GuildTextBasedChannel;
				if (messageChannel) {
					const message = await messageChannel?.send(`Shuffled the ${queueMention(queue)} queue.`).catch(() => null);
					LoggingUtils.log(store, true, message).catch(() => null);
				}
			}

			return members;
		});
	}

	export async function getMemberDisplayLine(store: Store, queue: DbQueue, userId: Snowflake) {
		const { position, member } = getMemberPosition(store, queue, userId);
		return new EmbedBuilder()
			.setTitle(queueMention(queue))
			.setColor(queue.color)
			.setDescription(await DisplayUtils.createMemberDisplayLine(store, member, position));
	}

	export async function describePulledMembers(store: Store, queue: DbQueue, pulledMembers: DbMember[], reason: MemberRemovalReason) {
		const pulledMembersOfQueue = pulledMembers.filter(member => member.queueId === queue.id);
		const membersStr = await membersMention(store, pulledMembersOfQueue);
		let description = "";
		if (queue.pullMessage) {
			description += `> ${queue.pullMessage}\n\n`;
		}
		description += pulledMembersOfQueue.length ? `${upperFirst(reason)} from queue:\n${membersStr}` : `No members were ${reason} from queue.`;
		return new EmbedBuilder()
			.setTitle(queueMention(queue))
			.setColor(queue.color)
			.setDescription(description);
	}

	export async function describeMyPositions(store: Store, userId: Snowflake) {
		const members = Queries.selectManyMembers({ guildId: store.guild.id, userId });
		const queues = members.map(member => Queries.selectQueue({ guildId: store.guild.id, id: member.queueId }));

		const embeds = await Promise.all(queues.map(queue =>
			MemberUtils.getMemberDisplayLine(store, queue, userId)
		));

		if (!embeds.length) {
			embeds.push(new EmbedBuilder().setDescription("You are not in any queues."));
		}

		return embeds;
	}

	export async function modifyMemberRoles(store: Store, memberId: Snowflake, roleId: Snowflake, modification: "add" | "remove") {
		if (!roleId) return;
		const member = await store.jsMember(memberId);
		try {
			if (modification === "add") {
				await member.roles.add(roleId);
			}
			else if (modification === "remove") {
				await member.roles.remove(roleId);
			}
		}
		catch (e) {
			const { message } = e as Error;
			if (message.includes("Missing Permissions")) {
				throw new CustomError({
					message: "Missing Permissions",
					embeds: [
						new EmbedBuilder()
							.setDescription(`I can not manage the ${roleMention(roleId)} role. Please check my permissions.`),
					],
				});
			}
			else {
				throw e;
			}
		}
	}

	export async function assignInQueueRoleToMembers(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, roleId: Snowflake, modification: "add" | "remove") {
		await Promise.all(
			map(queues, async (queue) => {
				const members = store.dbMembers().filter(member => member.queueId === queue.id);
				return Promise.all(
					members.map((member) =>
						MemberUtils.modifyMemberRoles(store, member.userId, roleId, modification)
					)
				);
			})
		);
	}

	// ====================================================================
	// 												 Helpers
	// ====================================================================

	function verifyMemberEligibility(store: Store, queue: DbQueue, jsMember: GuildMember, archivedMember: DbArchivedMember) {
		if (queue.lockToggle) {
			throw new QueueLockedError();
		}
		if (queue.size) {
			const members = store.dbMembers().filter(member => member.queueId === queue.id);
			if (members.size >= queue.size) {
				throw new QueueFullError();
			}
		}
		if (WhitelistUtils.isBlockedByWhitelist(store, queue.id, jsMember)) {
			throw new NotOnQueueWhitelistError();
		}
		if (BlacklistUtils.isBlockedByBlacklist(store, queue.id, jsMember)) {
			throw new OnQueueBlacklistError();
		}

		if (queue.voiceOnlyToggle) {
			const voices = store.dbVoices().filter(voice => voice.queueId === queue.id);
			if (!jsMember.voice || !voices.some(voice => voice.sourceChannelId === jsMember.voice.channelId)) {
				let message: string;
				if (voices.size === 0) {
					message = "This queue is voice-only, but no voice channels are linked to it. Please contact a server administrator.";
				}
				else if (voices.size === 1) {
					message = `You must be in the ${channelMention(voices.first().sourceChannelId)} voice channel to join the queue.`;
				}
				else {
					message = "You must be in one of the following voice channels to join the queue:\n" +
						map(voices, voice => `- ${channelMention(voice.sourceChannelId)}`).join("\n");
				}
				throw new CustomError({
					message: "Not in voice channel",
					embeds: [new EmbedBuilder().setDescription(message)],
				});
			}
		}

		if (queue.rejoinCooldownPeriod && archivedMember?.reason === MemberRemovalReason.Pulled) {
			const msSincePulled = BigInt(Date.now()) - archivedMember.archivedTime;
			const msCooldownRemaining = (queue.rejoinCooldownPeriod * 1000n) - msSincePulled;
			if (msCooldownRemaining > 0) {
				throw new CustomError({
					message: "You are currently in a cooldown period and cannot rejoin the queue",
					embeds: [
						new EmbedBuilder()
							.setDescription(`You can rejoin the queue in ${timeMention(msCooldownRemaining / 1000n)}.`),
					],
				});
			}
		}
	}

	function getMemberPosition(store: Store, queue: DbQueue, userId: Snowflake) {
		const members = [...store.dbMembers().filter(member => member.queueId === queue.id).values()];
		const member = members.find(member => member.userId === userId);
		const position = members.indexOf(member) + 1;
		return { position, member };
	}
}
