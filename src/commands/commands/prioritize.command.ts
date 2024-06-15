import { type Collection, SlashCommandBuilder } from "discord.js";

import { type DbQueue, PRIORITIZED_TABLE } from "../../db/schema.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { PrioritizedsOption } from "../../options/options/prioritizeds.option.ts";
import { PriorityOrderOption } from "../../options/options/priority-order.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { ReasonOption } from "../../options/options/reason.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { PriorityUtils } from "../../utils/priority.utils.ts";
import { describeTable, mentionableMention, mentionablesMention, queuesMention } from "../../utils/string.utils.ts";

export class PrioritizeCommand extends AdminCommand {
	static readonly ID = "prioritize";

	prioritize_get = PrioritizeCommand.prioritize_get;
	prioritize_add = PrioritizeCommand.prioritize_add;
	prioritize_update = PrioritizeCommand.prioritize_update;
	prioritize_delete = PrioritizeCommand.prioritize_delete;

	data = new SlashCommandBuilder()
		.setName(PrioritizeCommand.ID)
		.setDescription("Manage prioritized users and roles")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get prioritized users and roles");
			Object.values(PrioritizeCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Prioritize users and roles");
			Object.values(PrioritizeCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("update")
				.setDescription("Update prioritized users and roles");
			Object.values(PrioritizeCommand.UPDATE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Un-prioritize users and roles");
			Object.values(PrioritizeCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /prioritize get
	// ====================================================================

	static readonly GET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Get prioritized entries of specific queue(s)" }),
	};

	static async prioritize_get(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		queues = queues ?? await PrioritizeCommand.GET_OPTIONS.queues.get(inter);

		const prioritized = inter.store.dbPrioritized().filter(prioritized => queues.has(prioritized.queueId));

		const descriptionMessage = describeTable({
			store: inter.store,
			table: PRIORITIZED_TABLE,
			tableLabel: "Prioritized members and roles",
			entryLabelProperty: "subjectId",
			entries: [...prioritized.values()],
			color: Color.Gold,
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /prioritize add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to prioritize in" }),
		mentionable1: new MentionableOption({ required: true, name: "mentionable_1", description: "User or role to prioritize" }),
		mentionable2: new MentionableOption({ name: "mentionable_2", description: "User or role to prioritize" }),
		mentionable3: new MentionableOption({ name: "mentionable_3", description: "User or role to prioritize" }),
		mentionable4: new MentionableOption({ name: "mentionable_4", description: "User or role to prioritize" }),
		mentionable5: new MentionableOption({ name: "mentionable_5", description: "User or role to prioritize" }),
		reason: new ReasonOption({ description: "Reason for the priority" }),
		priorityOrder: new PriorityOrderOption({ description: "Lower priority orders go first" }),
	};

	static async prioritize_add(inter: SlashInteraction) {
		const queues = await PrioritizeCommand.ADD_OPTIONS.queues.get(inter);
		const mentionables = [
			PrioritizeCommand.ADD_OPTIONS.mentionable1.get(inter),
			PrioritizeCommand.ADD_OPTIONS.mentionable2.get(inter),
			PrioritizeCommand.ADD_OPTIONS.mentionable3.get(inter),
			PrioritizeCommand.ADD_OPTIONS.mentionable4.get(inter),
			PrioritizeCommand.ADD_OPTIONS.mentionable5.get(inter),
		];
		const priorityOrder = PrioritizeCommand.ADD_OPTIONS.priorityOrder.get(inter);
		const reason = PrioritizeCommand.ADD_OPTIONS.reason.get(inter);

		const {
			updatedQueueIds,
			insertedPrioritized,
		} = PriorityUtils.insertPrioritized(inter.store, queues, mentionables, priorityOrder, reason);
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		await inter.respond(`Prioritized ${mentionablesMention(insertedPrioritized)} in the '${queuesMention(updatedQueues)}' queue${updatedQueues.length > 1 ? "s" : ""}.`, true);
		await this.prioritize_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /prioritize update
	// ====================================================================

	static readonly UPDATE_OPTIONS = {
		prioritizeds: new PrioritizedsOption({ required: true, description: "Prioritized users and roles to update" }),
		priorityOrder: new PriorityOrderOption({ description: "Lower priority orders go first" }),
		reason: new ReasonOption({ description: "Reason for the priority" }),
	};

	static async prioritize_update(inter: SlashInteraction) {
		const prioritizeds = await PrioritizeCommand.UPDATE_OPTIONS.prioritizeds.get(inter);
		const priorityOrder = PrioritizeCommand.UPDATE_OPTIONS.priorityOrder.get(inter);
		const reason = PrioritizeCommand.UPDATE_OPTIONS.reason.get(inter);

		const {
			updatedPrioritized,
			updatedQueueIds,
		} = PriorityUtils.updatePrioritized(inter.store, prioritizeds.map(prioritized => prioritized.id), {
			priorityOrder,
			reason,
		});
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		await inter.respond(`Updated priority of ${updatedPrioritized.map(mentionableMention)}.`, true);
		await this.prioritize_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /prioritize delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		prioritizeds: new PrioritizedsOption({
			required: true,
			description: "Prioritized users and roles to un-prioritize",
		}),
	};

	static async prioritize_delete(inter: SlashInteraction) {
		const prioritizeds = await PrioritizeCommand.DELETE_OPTIONS.prioritizeds.get(inter);

		const {
			updatedQueueIds,
			deletedPrioritized,
		} = PriorityUtils.deletePrioritized(inter.store, prioritizeds.map(prioritized => prioritized.id));
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		await inter.respond(`Un-prioritized ${deletedPrioritized.map(mentionableMention).join(", ")}.`, true);
		await this.prioritize_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}
}
