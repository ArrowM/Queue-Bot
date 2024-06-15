import { channelMention, type Collection, inlineCode, roleMention, SlashCommandBuilder } from "discord.js";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { findKey, isNil, omitBy } from "lodash-es";

import { db } from "../../db/db.ts";
import { type DbQueue, QUEUE_TABLE } from "../../db/schema.ts";
import { AutopullToggleOption } from "../../options/options/autopull-toggle.option.ts";
import { BadgeToggleOption } from "../../options/options/badge-toggle.option.ts";
import { ButtonsToggleOption } from "../../options/options/buttons-toggle.option.ts";
import { ColorOption } from "../../options/options/color.option.ts";
import { DisplayUpdateTypeOption } from "../../options/options/display-update-type.option.ts";
import { HeaderOption } from "../../options/options/header.option.ts";
import { InlineToggleOption } from "../../options/options/inline-toggle.option.ts";
import { LockToggleOption } from "../../options/options/lock-toggle.option.ts";
import { MemberDisplayTypeOption } from "../../options/options/member-display-type.option.ts";
import { NameOption } from "../../options/options/name.option.ts";
import { NotificationsToggleOption } from "../../options/options/notifications-enable.option.ts";
import { PullBatchSizeOption } from "../../options/options/pull-batch-size.option.ts";
import { PullMessageOption } from "../../options/options/pull-message.option.ts";
import { QueueOption } from "../../options/options/queue.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { RejoinCooldownPeriodOption } from "../../options/options/rejoin-cooldown-period.option.ts";
import { RejoinGracePeriodOption } from "../../options/options/rejoin-grace-period.option.ts";
import { RoleInQueueOption } from "../../options/options/role-in-queue.option.ts";
import { RoleOnPullOption } from "../../options/options/role-on-pull.option.ts";
import { SizeOption } from "../../options/options/size.option.ts";
import { TimestampTypeOption } from "../../options/options/timestamp-type.option.ts";
import { VoiceDestinationChannelOption } from "../../options/options/voice-destination-channel.option.ts";
import { VoiceOnlyToggleOption } from "../../options/options/voice-only-toggle.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { ArchivedMemberReason } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { DisplayUtils } from "../../utils/display.utils.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { QueueUtils } from "../../utils/queue.utils.ts";
import { describeTable, propertyMention, queueMention, queuesMention, timeMention } from "../../utils/string.utils.ts";

export class QueuesCommand extends AdminCommand {
	static readonly ID = "queues";

	queues_get = QueuesCommand.queues_get;
	queues_add = QueuesCommand.queues_add;
	queues_set = QueuesCommand.queues_set;
	queues_reset = QueuesCommand.queues_reset;
	queues_delete = QueuesCommand.queues_delete;

	data = new SlashCommandBuilder()
		.setName(QueuesCommand.ID)
		.setDescription("Manage queues")
		.addSubcommand((subcommand) => {
			subcommand
				.setName("get")
				.setDescription("Get queues properties");
			Object.values(QueuesCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand((subcommand) => {
			subcommand
				.setName("add")
				.setDescription("Create a queue");
			Object.values(QueuesCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand((subcommand) => {
			subcommand
				.setName("set")
				.setDescription("Set queue properties");
			Object.values(QueuesCommand.SET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand((subcommand) => {
			subcommand
				.setName("reset")
				.setDescription("Reset queue properties");
			Object.values(QueuesCommand.RESET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand((subcommand) => {
			subcommand
				.setName("delete")
				.setDescription("Delete a queue");
			Object.values(QueuesCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /queues get
	// ====================================================================

	static readonly GET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Get specific queue(s)" }),
	};

	static async queues_get(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		queues = queues ?? await QueuesCommand.GET_OPTIONS.queues.get(inter);

		const descriptionMessage = describeTable({
			store: inter.store,
			table: QUEUE_TABLE,
			tableLabel: "Queues",
			entryLabel: "properties:",
			hiddenProperties: ["name"],
			queueIdProperty: "id",
			propertyFormatters: {
				roleInQueueId: roleMention,
				roleOnPullId: roleMention,
				rejoinCooldownPeriod: timeMention,
				rejoinGracePeriod: timeMention,
				voiceDestinationChannelId: channelMention,
			},
			entries: [...queues.values()],
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /queues add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		name: new NameOption({ required: true, description: "Name of the queue" }),
		autopullToggle: new AutopullToggleOption({ description: "Toggle automatic pulling of queue members" }),
		badgeToggle: new BadgeToggleOption({ description: "Toggle badges next to queue name" }),
		buttonsToggle: new ButtonsToggleOption({ description: "Toggle buttons beneath queue displays" }),
		color: new ColorOption({ description: "Color of the queue" }),
		displayUpdateType: new DisplayUpdateTypeOption({ description: "How to update displays" }),
		header: new HeaderOption({ description: "Header of the queue display" }),
		inlineToggle: new InlineToggleOption({ description: "Toggle inline display of queue members" }),
		lockToggle: new LockToggleOption({ description: "Toggle queue locked status (prevents joining)" }),
		memberDisplayType: new MemberDisplayTypeOption({ description: "How to display members" }),
		notificationsToggle: new NotificationsToggleOption({ description: "Toggle whether users are DM-ed on pull" }),
		pullBatchSize: new PullBatchSizeOption({ description: "How many queue members to include in a pull" }),
		pullMessage: new PullMessageOption({ description: "Additional message to include on pull" }),
		rejoinCooldownPeriod: new RejoinCooldownPeriodOption({ description: "# of seconds a member must wait before re-queueing after being pulled" }),
		rejoinGracePeriod: new RejoinGracePeriodOption({ description: "# of seconds a member has to reclaim their queue spot after leaving" }),
		roleInQueue: new RoleInQueueOption({ description: "Role to assign members of the queue" }),
		roleOnPull: new RoleOnPullOption({ description: "Role to assign members when they are pulled" }),
		size: new SizeOption({ description: "Limit the size of the queue" }),
		timestampType: new TimestampTypeOption({ description: "How to display timestamps" }),
		voiceOnlyToggle: new VoiceOnlyToggleOption({ description: "Toggle whether queue is restricted to members in source voice channel" }),
		voiceDestinationChannel: new VoiceDestinationChannelOption({ description: "Voice channel to move members to when they are pulled" }),
	};

	static async queues_add(inter: SlashInteraction) {
		const queue = {
			guildId: inter.guildId,
			name: QueuesCommand.ADD_OPTIONS.name.get(inter),
			...omitBy({
				autopullToggle: QueuesCommand.ADD_OPTIONS.autopullToggle.get(inter),
				badgeToggle: QueuesCommand.ADD_OPTIONS.badgeToggle.get(inter),
				buttonsToggle: QueuesCommand.ADD_OPTIONS.buttonsToggle.get(inter),
				color: QueuesCommand.ADD_OPTIONS.color.get(inter),
				displayUpdateType: QueuesCommand.ADD_OPTIONS.displayUpdateType.get(inter),
				header: QueuesCommand.ADD_OPTIONS.header.get(inter),
				inlineToggle: QueuesCommand.ADD_OPTIONS.inlineToggle.get(inter),
				lockToggle: QueuesCommand.ADD_OPTIONS.lockToggle.get(inter),
				memberDisplayType: QueuesCommand.ADD_OPTIONS.memberDisplayType.get(inter),
				notificationsToggle: QueuesCommand.ADD_OPTIONS.notificationsToggle.get(inter),
				pullBatchSize: QueuesCommand.ADD_OPTIONS.pullBatchSize.get(inter),
				pullMessage: QueuesCommand.ADD_OPTIONS.pullMessage.get(inter),
				rejoinCooldownPeriod: QueuesCommand.ADD_OPTIONS.rejoinCooldownPeriod.get(inter),
				rejoinGracePeriod: QueuesCommand.ADD_OPTIONS.rejoinGracePeriod.get(inter),
				roleInQueueId: QueuesCommand.ADD_OPTIONS.roleInQueue.get(inter)?.id,
				roleOnPullId: QueuesCommand.ADD_OPTIONS.roleOnPull.get(inter)?.id,
				size: QueuesCommand.ADD_OPTIONS.size.get(inter),
				timestampType: QueuesCommand.ADD_OPTIONS.timestampType.get(inter),
				voiceOnlyToggle: QueuesCommand.ADD_OPTIONS.voiceOnlyToggle.get(inter),
				voiceDestinationChannelId: QueuesCommand.ADD_OPTIONS.voiceDestinationChannel.get(inter)?.id,
			}, isNil),
		};

		const { insertedQueue } = await QueueUtils.insertQueue(inter.store, queue);

		await DisplayUtils.insertDisplays(inter.store, [insertedQueue], inter.channelId);

		await QueuesCommand.queues_get(inter, toCollection<bigint, DbQueue>("id", [insertedQueue]));
	}

	// ====================================================================
	//                           /queues set
	// ====================================================================

	static readonly SET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to update" }),
		autopullToggle: new AutopullToggleOption({ description: "Toggle automatic pulling of queue members" }),
		badgeToggle: new BadgeToggleOption({ description: "Toggle badges next to queue name" }),
		buttonsToggle: new ButtonsToggleOption({ description: "Toggle buttons beneath queue displays" }),
		color: new ColorOption({ description: "Color of the queue" }),
		displayUpdateType: new DisplayUpdateTypeOption({ description: "How to update displays" }),
		header: new HeaderOption({ description: "Header of the queue display" }),
		inlineToggle: new InlineToggleOption({ description: "Toggle inline display of queue members" }),
		lockToggle: new LockToggleOption({ description: "Toggle queue locked status (prevents joining)" }),
		memberDisplayType: new MemberDisplayTypeOption({ description: "How to display members" }),
		name: new NameOption({ description: "Name of the queue" }),
		notificationsToggle: new NotificationsToggleOption({ description: "Toggle whether users are DM-ed on pull" }),
		pullBatchSize: new PullBatchSizeOption({ description: "How many queue members to include in a pull" }),
		pullMessage: new PullMessageOption({ description: "Additional message to include on pull" }),
		rejoinCooldownPeriod: new RejoinCooldownPeriodOption({ description: "# of seconds a  member must wait before re-queueing after being pulled" }),
		rejoinGracePeriod: new RejoinGracePeriodOption({ description: "# of seconds a  member has to reclaim their queue spot after leaving" }),
		roleInQueue: new RoleInQueueOption({ description: "Role to assign members of the queue" }),
		roleOnPull: new RoleOnPullOption({ description: "Role to assign members when they are pulled" }),
		size: new SizeOption({ description: "Limit the size of the queue" }),
		timestampType: new TimestampTypeOption({ description: "How to display timestamps" }),
		voiceOnlyToggle: new VoiceOnlyToggleOption({ description: "Toggle whether queue is restricted to members in source voice channel" }),
		voiceDestinationChannel: new VoiceDestinationChannelOption({ description: "Voice channel to move members to when they are pulled" }),
	};

	static async queues_set(inter: SlashInteraction) {
		const queues = await QueuesCommand.SET_OPTIONS.queues.get(inter);
		const update = omitBy({
			autopullToggle: QueuesCommand.SET_OPTIONS.autopullToggle.get(inter),
			badgeToggle: QueuesCommand.SET_OPTIONS.badgeToggle.get(inter),
			buttonsToggle: QueuesCommand.SET_OPTIONS.buttonsToggle.get(inter),
			color: QueuesCommand.SET_OPTIONS.color.get(inter),
			displayUpdateType: QueuesCommand.SET_OPTIONS.displayUpdateType.get(inter),
			header: QueuesCommand.SET_OPTIONS.header.get(inter),
			inlineToggle: QueuesCommand.SET_OPTIONS.inlineToggle.get(inter),
			lockToggle: QueuesCommand.SET_OPTIONS.lockToggle.get(inter),
			memberDisplayType: QueuesCommand.SET_OPTIONS.memberDisplayType.get(inter),
			name: QueuesCommand.SET_OPTIONS.name.get(inter),
			notificationsToggle: QueuesCommand.SET_OPTIONS.notificationsToggle.get(inter),
			pullBatchSize: QueuesCommand.SET_OPTIONS.pullBatchSize.get(inter),
			pullMessage: QueuesCommand.SET_OPTIONS.pullMessage.get(inter),
			rejoinCooldownPeriod: QueuesCommand.SET_OPTIONS.rejoinCooldownPeriod.get(inter),
			rejoinGracePeriod: QueuesCommand.SET_OPTIONS.rejoinGracePeriod.get(inter),
			roleInQueueId: QueuesCommand.SET_OPTIONS.roleInQueue.get(inter)?.id,
			roleOnPullId: QueuesCommand.SET_OPTIONS.roleOnPull.get(inter)?.id,
			size: QueuesCommand.SET_OPTIONS.size.get(inter),
			timestampType: QueuesCommand.SET_OPTIONS.timestampType.get(inter),
			voiceOnlyToggle: QueuesCommand.SET_OPTIONS.voiceOnlyToggle.get(inter),
			voiceDestinationChannelId: QueuesCommand.ADD_OPTIONS.voiceDestinationChannel.get(inter)?.id,
		}, isNil);

		if (update.voiceOnlyToggle) {
			const nonVoiceOnlyQueues = queues.filter(queue => !queue.voiceOnlyToggle);
			for (const queue of nonVoiceOnlyQueues.values()) {
				const members = inter.store.dbMembers().filter(member => member.queueId === queue.id);
				if (members.size) {
					const confirmed = await inter.promptConfirmOrCancel(
						`You are enabling ${inlineCode(VoiceOnlyToggleOption.ID)} for the '${queueMention(queue)}' queue. ` +
						`There are ${members.size} member${members.size === 1 ? "" : "s"} in the '${queueMention(queue)}' queue that will be cleared if you proceed. ` +
						"Do you wish to proceed?",
					);
					if (!confirmed) {
						await inter.respond("Cancelled queue update. No changes have been made.");
						return;
					}
				}
			}
			for (const queue of nonVoiceOnlyQueues.values()) {
				await MemberUtils.deleteMembers({ store: inter.store, queues: [queue], reason: ArchivedMemberReason.Kicked });
				await inter.respond(`Cleared ${queueMention(queue)} queue of members due to ${inlineCode(VoiceOnlyToggleOption.ID)} being enabled.`, true);
			}
		}

		const { updatedQueues } = await QueueUtils.updateQueues(inter.store, queues, update);

		await inter.respond(`Updated ${Object.keys(update).map(propertyMention).join(", ")} of '${queuesMention(queues)}' queue${queues.size > 1 ? "s" : ""}.`, true);

		await QueuesCommand.queues_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /queues reset
	// ====================================================================

	static readonly RESET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to reset" }),
	};

	static async queues_reset(inter: SlashInteraction) {
		const queues = await QueuesCommand.RESET_OPTIONS.queues.get(inter);

		const selectMenuOptions = [
			{ name: AutopullToggleOption.ID, value: QUEUE_TABLE.autopullToggle.name },
			{ name: BadgeToggleOption.ID, value: QUEUE_TABLE.badgeToggle.name },
			{ name: ButtonsToggleOption.ID, value: QUEUE_TABLE.buttonsToggle.name },
			{ name: ColorOption.ID, value: QUEUE_TABLE.color.name },
			{ name: DisplayUpdateTypeOption.ID, value: QUEUE_TABLE.displayUpdateType.name },
			{ name: HeaderOption.ID, value: QUEUE_TABLE.header.name },
			{ name: InlineToggleOption.ID, value: QUEUE_TABLE.inlineToggle.name },
			{ name: LockToggleOption.ID, value: QUEUE_TABLE.lockToggle.name },
			{ name: MemberDisplayTypeOption.ID, value: QUEUE_TABLE.memberDisplayType.name },
			{ name: NameOption.ID, value: QUEUE_TABLE.name.name },
			{ name: NotificationsToggleOption.ID, value: QUEUE_TABLE.notificationsToggle.name },
			{ name: PullBatchSizeOption.ID, value: QUEUE_TABLE.pullBatchSize.name },
			{ name: PullMessageOption.ID, value: QUEUE_TABLE.pullMessage.name },
			{ name: RejoinCooldownPeriodOption.ID, value: QUEUE_TABLE.rejoinCooldownPeriod.name },
			{ name: RejoinGracePeriodOption.ID, value: QUEUE_TABLE.rejoinGracePeriod.name },
			{ name: RoleInQueueOption.ID, value: QUEUE_TABLE.roleInQueueId.name },
			{ name: RoleOnPullOption.ID, value: QUEUE_TABLE.roleOnPullId.name },
			{ name: SizeOption.ID, value: QUEUE_TABLE.size.name },
			{ name: TimestampTypeOption.ID, value: QUEUE_TABLE.timestampType.name },
			{ name: VoiceOnlyToggleOption.ID, value: QUEUE_TABLE.voiceOnlyToggle.name },
		];
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const propertiesToReset = await selectMenuTransactor.sendAndReceive("Queue properties to reset", selectMenuOptions);

		const updatedProperties = {} as any;
		for (const property of propertiesToReset) {
			const columnKey = findKey(QUEUE_TABLE, (column: SQLiteColumn) => column.name === property);
			updatedProperties[columnKey] = (QUEUE_TABLE as any)[columnKey]?.default;
		}

		const updatedQueues = db.transaction(() =>
			queues.map((queue) => inter.store.updateQueue({ id: queue.id, ...updatedProperties })),
		);

		if (updatedProperties.roleId) {
			await MemberUtils.assignInQueueRoleToMembers(inter.store, queues, updatedProperties.roleId, "remove");
		}

		const propertiesStr = propertiesToReset.map(inlineCode).join(", ");
		const propertiesWord = propertiesToReset.length === 1 ? "property" : "properties";
		const queuesStr = queuesMention(queues);
		const queuesWord = queues.size === 1 ? "queue" : "queues";
		const haveWord = propertiesToReset.length === 1 ? "has" : "have";
		const resetPropertiesStr = `${propertiesStr} ${haveWord} been reset for ${queuesStr} ${queuesWord}.`;

		await selectMenuTransactor.updateWithResult(`Reset ${queuesWord} ${propertiesWord}`, resetPropertiesStr);

		DisplayUtils.requestDisplaysUpdate(inter.store, queues.map(queue => queue.id));

		await QueuesCommand.queues_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /queues delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		queue: new QueueOption({ required: true, description: "Queue to delete" }),
	};

	static async queues_delete(inter: SlashInteraction) {
		const queue = await QueuesCommand.DELETE_OPTIONS.queue.get(inter);

		const confirmed = await inter.promptConfirmOrCancel(`Are you sure you want to delete the '${queueMention(queue)}' queue?`);
		if (!confirmed) {
			await inter.respond("Cancelled queue deletion");
			return;
		}

		const deletedQueue = inter.store.deleteQueue({ id: queue.id });

		await inter.respond(`Deleted the '${queueMention(deletedQueue)}' queue.`, true);
	}
}