import { channelMention, type Collection, inlineCode, SlashCommandBuilder } from "discord.js";
import { isNil, omitBy, partition } from "lodash-es";

import { type DbQueue, VOICE_TABLE } from "../../db/schema.ts";
import { JoinSyncToggleOption } from "../../options/options/join-sync-toggle.option.ts";
import { LeaveSyncToggleOption } from "../../options/options/leave-sync-toggle.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { VoiceDestinationChannelOption } from "../../options/options/voice-destination-channel.option.ts";
import { VoiceOnlyToggleOption } from "../../options/options/voice-only-toggle.option.ts";
import { VoiceSourceChannelOption } from "../../options/options/voice-source-channel.option.ts";
import { VoicesOption } from "../../options/options/voices.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { ArchivedMemberReason, Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { QueueUtils } from "../../utils/queue.utils.ts";
import { commandMention, describeTable, queueMention, queuesMention } from "../../utils/string.utils.ts";
import { VoiceUtils } from "../../utils/voice.utils.ts";

export class VoiceCommand extends AdminCommand {
	static readonly ID = "voice";

	voice_get = VoiceCommand.voice_get;
	voice_add_source = VoiceCommand.voice_add_source;
	voice_set_source = VoiceCommand.voice_set_source;
	voice_delete_source = VoiceCommand.voice_delete_source;
	voice_set_destination = VoiceCommand.voice_set_destination;
	voice_disable_destination = VoiceCommand.voice_disable_destination;

	data = new SlashCommandBuilder()
		.setName(VoiceCommand.ID)
		.setDescription("Manage voice integrations")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get voice integrations");
			Object.values(VoiceCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add_source")
				.setDescription("Add voice source channel");
			Object.values(VoiceCommand.ADD_SOURCE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set_source")
				.setDescription("Update voice source channel");
			Object.values(VoiceCommand.SET_SOURCE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete_source")
				.setDescription("Delete voice source channel");
			Object.values(VoiceCommand.DELETE_SOURCE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set_destination")
				.setDescription("Set voice destination channel (also possible with /queues set)");
			Object.values(VoiceCommand.SET_DESTINATION_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("disable_destination")
				.setDescription("Reset voice destination channel (also possible with /queues reset)");
			Object.values(VoiceCommand.DISABLE_DESTINATION_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /voice get
	// ====================================================================

	static readonly GET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Get voice integrations of specific queue(s)" }),
	};

	static async voice_get(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		queues = queues ?? await VoiceCommand.GET_OPTIONS.queues.get(inter);

		const voices = inter.store.dbVoices()
			.filter(voice => queues.has(voice.queueId))
			.map(voice => {
				const queue = inter.store.dbQueues().get(voice.queueId);
				return {
					...voice,
					voiceDestinationChannelId: queue.voiceDestinationChannelId,
					voiceOnlyToggle: queue.voiceOnlyToggle,
				};
			});

		const descriptionMessage = describeTable({
			store: inter.store,
			table: VOICE_TABLE,
			tableLabel: "Voice channel sources",
			entryLabelProperty: "sourceChannelId",
			propertyFormatters: {
				sourceChannelId: id => `source: ${channelMention(id)}`,
			},
			entries: [...voices.values()],
			color: Color.Blue,
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /voice add_source
	// ====================================================================

	static readonly ADD_SOURCE_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to set source voice channel" }),
		sourceVoiceChannel: new VoiceSourceChannelOption({ required: true, description: "Voice channel to pull members from" }),
		joinSync: new JoinSyncToggleOption({ description: "Toggle whether members are enqueued on voice join" }),
		leaveSync: new LeaveSyncToggleOption({ description: "Toggle whether members are dequeued on voice leave" }),
	};

	static async voice_add_source(inter: SlashInteraction) {
		const queues = await VoiceCommand.ADD_SOURCE_OPTIONS.queues.get(inter);
		const sourceChannelId = VoiceCommand.ADD_SOURCE_OPTIONS.sourceVoiceChannel.get(inter)?.id;
		const joinSync = VoiceCommand.ADD_SOURCE_OPTIONS.joinSync.get(inter);
		const leaveSync = VoiceCommand.ADD_SOURCE_OPTIONS.leaveSync.get(inter);

		const [voiceOnlyQueues, nonVoiceOnlyQueues] = partition([...queues.values()], queue => queue.voiceOnlyToggle);
		for (const queue of voiceOnlyQueues.values()) {
			const members = inter.store.dbMembers().filter(member => member.queueId === queue.id);
			if (members.size) {
				const confirmed = await inter.promptConfirmOrCancel(
					`The '${queueMention(queue)}' queue has ${inlineCode(VoiceOnlyToggleOption.ID)} enabled. ` +
					`There are ${members.size} member${members.size === 1 ? "" : "s"} in the '${queueMention(queue)}' queue that will be cleared if you proceed. ` +
					"Do you wish to proceed?",
				);
				if (!confirmed) {
					await inter.respond("Cancelled voice integration addition. No changes have been made.");
					return;
				}
			}
		}
		for (const queue of voiceOnlyQueues.values()) {
			await MemberUtils.deleteMembers({ store: inter.store, queues: [queue], reason: ArchivedMemberReason.Kicked });
			await inter.respond(`Cleared ${queueMention(queue)} queue of members due to ${inlineCode(VoiceOnlyToggleOption.ID)} being enabled.`, true);
		}
		if (nonVoiceOnlyQueues.length) {
			await inter.respond(
				`${inlineCode(VoiceOnlyToggleOption.ID)} is not enabled for the '${queuesMention(nonVoiceOnlyQueues)}' queue${nonVoiceOnlyQueues.length > 1 ? "s" : ""}. ` +
				`Members will still be able to join via buttons or commands. ${inlineCode(VoiceOnlyToggleOption.ID)} can be changed with ${commandMention("queues", "set")}.`,
			);
		}

		const newVoice = { sourceChannelId, joinSync, leaveSync };

		const {
			updatedQueueIds,
		} = VoiceUtils.insertVoices(inter.store, queues, newVoice);
		const updatedQueues = updatedQueueIds.map(id => inter.store.dbQueues().get(id));

		await inter.respond(`Added voice integrations to the '${queuesMention(updatedQueues)}' queue${updatedQueues.length > 1 ? "s" : ""}`, true);
		await this.voice_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /voice set_source
	// ====================================================================

	static readonly SET_SOURCE_OPTIONS = {
		voices: new VoicesOption({ required: true, description: "Voice integrations to update" }),
		voiceSourceChannel: new VoiceSourceChannelOption({ description: "Voice channel to pull members from" }),
		joinSync: new JoinSyncToggleOption({ description: "Toggle whether members are enqueued on voice join" }),
		leaveSync: new LeaveSyncToggleOption({ description: "Toggle whether members are dequeued on voice leave" }),
	};

	static async voice_set_source(inter: SlashInteraction) {
		const voices = await VoiceCommand.SET_SOURCE_OPTIONS.voices.get(inter);
		const voiceSourceChannelId = VoiceCommand.SET_SOURCE_OPTIONS.voiceSourceChannel.get(inter)?.id;
		const joinSync = VoiceCommand.SET_SOURCE_OPTIONS.joinSync.get(inter);
		const leaveSync = VoiceCommand.SET_SOURCE_OPTIONS.leaveSync.get(inter);

		const update = omitBy({
			voiceSourceChannelId,
			joinSync,
			leaveSync,
		}, isNil);

		const {
			updatedQueueIds,
		} = VoiceUtils.updateVoices(inter.store, voices.map(voice => voice.id), update);
		const updatedQueues = updatedQueueIds.map(id => inter.store.dbQueues().get(id));

		await inter.respond(`Updated voice integrations in '${queuesMention(updatedQueues)}' queue${updatedQueues.length > 1 ? "s" : ""}`, true);
		await this.voice_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /voice delete_source
	// ====================================================================

	static readonly DELETE_SOURCE_OPTIONS = {
		voices: new VoicesOption({ required: true, description: "Voice integrations to delete" }),
	};

	static async voice_delete_source(inter: SlashInteraction) {
		const voices = await VoiceCommand.DELETE_SOURCE_OPTIONS.voices.get(inter);

		const {
			updatedQueueIds,
		} = VoiceUtils.deleteVoices(inter.store, voices.map(voice => voice.id));
		const updatedQueues = updatedQueueIds.map(id => inter.store.dbQueues().get(id));

		await inter.respond(`Deleted voice integrations in '${queuesMention(updatedQueues)}' queue${updatedQueues.length > 1 ? "s" : ""}`, true);

		await this.voice_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /voice set_destination
	// ====================================================================

	static readonly SET_DESTINATION_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to set destination voice channel" }),
		voiceDestinationChannel: new VoiceDestinationChannelOption({ required: true, description: "Voice channel to push members to" }),
	};

	static async voice_set_destination(inter: SlashInteraction) {
		const queues = await VoiceCommand.SET_DESTINATION_OPTIONS.queues.get(inter);
		const voiceDestinationChannelId = VoiceCommand.SET_DESTINATION_OPTIONS.voiceDestinationChannel.get(inter)?.id;

		await QueueUtils.updateQueues(inter.store, queues, { voiceDestinationChannelId });

		await inter.respond(`Updated voice destination channel of '${queuesMention(queues)}' queue${queues.size > 1 ? "s" : ""}.`, true);
	}

	// ====================================================================
	//                           /voice disable_destination
	// ====================================================================

	static readonly DISABLE_DESTINATION_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to disable destination voice channel" }),
	};

	static async voice_disable_destination(inter: SlashInteraction) {
		const queues = await VoiceCommand.DISABLE_DESTINATION_OPTIONS.queues.get(inter);

		await QueueUtils.updateQueues(inter.store, queues, { voiceDestinationChannelId: null });

		await inter.respond(`Unset voice destination channel of '${queuesMention(queues)}' queue${queues.size > 1 ? "s" : ""}.`, true);
	}
}
