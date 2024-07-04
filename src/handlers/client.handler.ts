import {
	type DMChannel,
	type Guild,
	type GuildMember, type Interaction, type Message,
	type NonThreadGuildBasedChannel,
	type PartialGuildMember,
	Role,
	StageChannel,
	VoiceChannel,
	VoiceState,
} from "discord.js";
import { compact, concat, shuffle } from "lodash-es";

import { Queries } from "../db/queries.ts";
import { Store } from "../db/store.ts";
import { MemberRemovalReason } from "../types/db.types.ts";
import { DisplayUtils } from "../utils/display.utils.ts";
import { MemberUtils } from "../utils/member.utils.ts";
import { QueueUtils } from "../utils/queue.utils.ts";
import { InteractionHandler } from "./interaction.handler.ts";
import { MessageHandler } from "./message.handler.ts";

export namespace ClientHandler {
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
			updated.forEach(({ queueId }) => DisplayUtils.requestDisplayUpdate(store, queueId));
		}
	}

	export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
		const member = oldState.member ?? newState.member;
		if (oldState.channelId === newState.channelId || !member) return;

		const guild = oldState.guild ?? newState.guild;
		if (!guild) return;
		const store = new Store(guild);

		const voices = store.dbVoices() .filter(voice => voice.joinSyncToggle && voice.sourceChannelId === newState.channelId);
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
			...store.dbQueues().filter(queue => (queue.voiceDestinationChannelId === oldState.channelId)).values(),
		));
		// Shuffle queues in case multiple target the same destination
		for (const queue of queuesToCheckForAutopull) {
			if (queue.autopullToggle && queue.voiceDestinationChannelId) {
				const destinationChannel = await store.jsChannel(queue.voiceDestinationChannelId) as VoiceChannel | StageChannel;
				if (destinationChannel && !destinationChannel.userLimit || destinationChannel.members.size < destinationChannel.userLimit) {
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
}