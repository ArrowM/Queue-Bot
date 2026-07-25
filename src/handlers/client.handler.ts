import {
	ActivityType,
	type DMChannel,
	type Guild,
	type GuildMember,
	type Interaction,
	type Message,
	type NonThreadGuildBasedChannel,
	type PartialGuildMember,
	type Presence,
	Role,
	StageChannel,
	VoiceChannel,
	VoiceState,
} from "discord.js";
import { compact, concat, shuffle } from "lodash-es";

import { CLIENT } from "../client/client.ts";
import { Queries } from "../db/queries.ts";
import { Store } from "../db/store.ts";
import { MemberRemovalReason } from "../types/db.types.ts";
import { DisplayUtils } from "../utils/display.utils.ts";
import { MemberUtils } from "../utils/member.utils.ts";
import { isGameNameMatch } from "../utils/misc.utils.ts";
import { QueueUtils } from "../utils/queue.utils.ts";
import { InteractionHandler } from "./interaction.handler.ts";
import { MessageHandler } from "./message.handler.ts";

export namespace ClientHandler {
	export const LIVE_PRESENCES = new Map<Snowflake, Presence>();

	export function handleGuildDelete(guild: Guild) {
		try {
			Queries.deleteGuild({ guildId: guild.id });
		}
		catch {
			// ignore
		}
	}

	export async function handleInteraction(inter: Interaction) {
		if (inter.guild) {
			await new InteractionHandler(inter).handle();
		}
		else if (inter.isButton()) {
			const customId = inter.customId;
			if (customId?.startsWith("renew:")) {
				const queueId = BigInt(customId.split(":")[1]);
				const queue = Queries.selectAllQueues().find(q => q.id === queueId);
				if (queue) {
					const guild = await CLIENT.guilds.fetch(queue.guildId).catch(() => null);
					if (guild) {
						Object.defineProperty(inter, "guild", { value: guild, configurable: true, writable: true });
						Object.defineProperty(inter, "guildId", { value: queue.guildId, configurable: true, writable: true });
						await new InteractionHandler(inter).handle();
						return;
					}
				}
			}
			if ("reply" in inter) {
				await inter.reply({ content: "This interaction is no longer valid.", ephemeral: true }).catch(() => null);
			}
		}
		else if ("reply" in inter) {
			await inter.reply("This command can only be used in servers").catch(() => null);
		}
	}

	export async function handleMessageCreate(message: Message) {
		if (message.guild && message.author.id !== message.client.user?.id) {
			await new MessageHandler(message).handle();
		}
	}

	export async function handleRoleDelete(role: Role) {
		const store = new Store(role.guild);
		await QueueUtils.updateQueues(
			store,
			store.dbQueues().filter(queue => queue.roleInQueueId === role.id),
			{ roleInQueueId: null }
		);
		await QueueUtils.updateQueues(
			store,
			store.dbQueues().filter(queue => queue.roleOnPullId === role.id),
			{ roleOnPullId: null }
		);
	}

	export async function handleGuildMemberRemove(member: GuildMember | PartialGuildMember) {
		const store = new Store(member.guild);
		await MemberUtils.deleteMembers({
			store,
			queues: store.dbQueues(),
			reason: MemberRemovalReason.NotFound,
			by: { userId: member.id },
		});
	}

	export function handleChannelDelete(channel: DMChannel | NonThreadGuildBasedChannel) {
		if ("guild" in channel) {
			const store = new Store(channel.guild);
			const updated = compact([
				...store.deleteManyDisplays({ displayChannelId: channel.id }),
				...store.deleteManyVoices({ sourceChannelId: channel.id }),
			]);
			updated.forEach(({ queueId }) => DisplayUtils.requestDisplayUpdate({ store, queueId }));
		}
	}

	export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
		const member = oldState.member ?? newState.member;
		if (oldState.channelId === newState.channelId || !member) return;

		const guild = oldState.guild ?? newState.guild;
		if (!guild) return;
		const store = new Store(guild);

		const voices = store.dbVoices().filter(voice => voice.joinSyncToggle && voice.sourceChannelId === newState.channelId);
		const queuesJoined = voices.map(voice => store.dbQueues().get(voice.queueId));
		for (const queue of queuesJoined.values()) {
			await MemberUtils.insertMember({
				store,
				queue,
				jsMember: newState.member,
			}).catch(() => null);
		}

		const queuesLeft = store.dbVoices()
			.filter(voice => voice.leaveSyncToggle && voice.sourceChannelId === oldState.channelId)
			.map(voice => store.dbQueues().get(voice.queueId));
		for (const queue of queuesLeft.values()) {
			await MemberUtils.deleteMembers({
				store,
				queues: [queue],
				reason: MemberRemovalReason.Left,
				by: { userId: newState.member!.id },
			}).catch(() => null);
		}

		// Queue spots opened up
		const queuesToCheckForAutopull = shuffle(concat(
			queuesJoined,
			...store.dbQueues().filter(queue => (queue.voiceDestinationChannelId === oldState.channelId)).values()
		));
		// Shuffle queues in case multiple target the same destination
		for (const queue of queuesToCheckForAutopull) {
			if (queue.autopullToggle && queue.voiceDestinationChannelId) {
				const destinationChannel = await store.jsChannel(queue.voiceDestinationChannelId) as VoiceChannel | StageChannel;
				if (
					destinationChannel &&
					(!destinationChannel.userLimit || destinationChannel.members.size < destinationChannel.userLimit)
				) {
					// Auto pull
					await MemberUtils.deleteMembers({
						store,
						queues: [queue],
						reason: MemberRemovalReason.Pulled,
						by: { count: 1 },
					}).catch(() => null);
				}
			}
		}
	}

	export async function handlePresenceUpdate(oldPresence: Presence | null, newPresence: Presence) {
		if (!newPresence) return;
		const guild = newPresence.guild ?? oldPresence?.guild;
		const userId = newPresence.userId ?? oldPresence?.userId;
		if (!guild || !userId) return;

		LIVE_PRESENCES.set(userId, newPresence);

		const username = newPresence?.user?.tag ?? newPresence?.user?.username ?? userId;
		const activities = newPresence?.activities ?? [];
		const isOffline = newPresence?.status === "offline";
		const activityNames = activities.map(a => `${ActivityType[a.type] ?? a.type}: "${a.name}"`).join(", ") || "No active activities";

		console.log(`[DEBUG PRESENCE EVENT] Update for ${username} (Status: ${newPresence?.status ?? "unknown"}) | Activities: [${activityNames}]`);

		const store = new Store(guild);
		const members = store.dbMembers().filter(member => member.userId === userId);
		if (!members.size) return;

		const memberQueueIds = new Set(members.map(m => m.queueId));
		const queues = store.dbQueues().filter(queue => queue.gamePresenceToggle && memberQueueIds.has(queue.id));
		if (!queues.size) return;

		for (const queue of queues.values()) {
			const gameName = queue.gamePresenceName?.trim();
			let stillPlaying = false;
			let matchedActivity = "";

			if (!isOffline && activities.length > 0) {
				if (gameName) {
					const match = activities.find(activity =>
						isGameNameMatch(activity.name, gameName)
					);
					if (match) {
						stillPlaying = true;
						matchedActivity = match.name;
					}
				}
				else {
					const match = activities.find(activity => activity.type === ActivityType.Playing || activity.type === ActivityType.Competing);
					if (match) {
						stillPlaying = true;
						matchedActivity = match.name;
					}
				}
			}

			if (stillPlaying) {
				console.log(`[DEBUG PRESENCE] User ${username} is actively playing "${matchedActivity}" matching filter "${gameName || 'any'}" for queue "${queue.name}".`);
			}
			else {
				console.log(`[DEBUG PRESENCE] Game OFF / Not playing for ${username} (Target filter: "${gameName || 'any'}"). Automatically removing user from queue "${queue.name}"...`);
				await MemberUtils.deleteMembers({
					store,
					queues: [queue],
					reason: MemberRemovalReason.Left,
					by: { userId },
				}).catch(() => null);
			}
		}
	}
}