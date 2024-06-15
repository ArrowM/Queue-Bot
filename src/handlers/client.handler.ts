import {
	type DMChannel,
	type Guild,
	type GuildMember,
	type NonThreadGuildBasedChannel,
	type PartialGuildMember,
	Role,
	StageChannel,
	VoiceChannel,
	VoiceState,
} from "discord.js";
import { compact, shuffle } from "lodash-es";

import { QueryUtils } from "../db/queries.ts";
import { Store } from "../db/store.ts";
import { ArchivedMemberReason } from "../types/db.types.ts";
import { DisplayUtils } from "../utils/display.utils.ts";
import { MemberUtils } from "../utils/member.utils.ts";
import { QueueUtils } from "../utils/queue.utils.ts";

export namespace ClientHandler {
	export function handleGuildDelete(guild: Guild) {
		try {
			QueryUtils.deleteGuild({ guildId: guild.id });
		}
		catch {
			// ignore
		}
	}

	export async function handleRoleDelete(role: Role) {
		const store = new Store(role.guild);
		await QueueUtils.updateQueues(
			store,
			store.dbQueues().filter(queue => queue.roleInQueueId === role.id),
			{ roleInQueueId: null },
		);
		await QueueUtils.updateQueues(
			store,
			store.dbQueues().filter(queue => queue.roleOnPullId === role.id),
			{ roleOnPullId: null },
		);
	}

	export async function handleGuildMemberRemove(member: GuildMember | PartialGuildMember) {
		const store = new Store(member.guild);
		await MemberUtils.deleteMembers({
			store,
			queues: store.dbQueues(),
			reason: ArchivedMemberReason.NotFound,
			by: { userId: member.id },
		});
	}

	export function handleChannelDelete(channel: DMChannel | NonThreadGuildBasedChannel) {
		if ("guild" in channel) {
			const store = new Store(channel.guild);
			const updated = compact([
				...store.deleteManyDisplays({ displayChannelId: channel.id }),
				...store.deleteManyVoices({ channelId: channel.id }),
			]);
			updated.forEach(({ queueId }) => DisplayUtils.requestDisplayUpdate(store, queueId));
		}
	}

	export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
		const member = oldState.member ?? newState.member;
		if (oldState.channelId === newState.channelId || !member) return;

		const guild = oldState.guild ?? newState.guild;
		if (!guild) return;
		const store = new Store(guild);

		const queuesJoined = store.dbVoices()
			.filter(voice => voice.joinSyncToggle && voice.sourceChannelId === newState.channelId)
			.map(voice => store.dbQueues().get(voice.queueId));
		for (const queue of queuesJoined.values()) {
			try {
				// Join
				await MemberUtils.insertJsMember({
					store,
					queue,
					jsMember: newState.member!,
				});
			}
			catch {
				// ignore
			}
		}

		const queuesLeft = store.dbVoices()
			.filter(voice => voice.leaveSyncToggle && voice.sourceChannelId === oldState.channelId)
			.map(voice => store.dbQueues().get(voice.queueId));
		for (const queue of queuesLeft.values()) {
			try {
				// Leave
				await MemberUtils.deleteMembers({
					store,
					queues: [queue],
					reason: ArchivedMemberReason.Left,
					by: { userId: newState.member!.id },
				});
			}
			catch {
				// ignore
			}
		}

		const queuesTargetingDestination = store.dbQueues().filter(queue => queue.voiceDestinationChannelId === oldState.channelId);
		// Shuffle queues in case multiple target the same destination
		for (const queue of shuffle([...queuesTargetingDestination.values()])) {
			if (queue.autopullToggle) {
				const destinationChannel = guild.channels.cache.get(queue.voiceDestinationChannelId) as VoiceChannel | StageChannel;
				if (destinationChannel && !destinationChannel.userLimit || destinationChannel.members.size < destinationChannel.userLimit) {
					try {
						// Auto pull
						await MemberUtils.deleteMembers({
							store,
							queues: [queue],
							reason: ArchivedMemberReason.Pulled,
							by: { count: destinationChannel.userLimit - destinationChannel.members.size },
						});
					}
					catch {
						// ignore
					}
				}
			}
		}
	}
}