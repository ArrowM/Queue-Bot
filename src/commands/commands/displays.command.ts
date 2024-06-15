import { type Collection, SlashCommandBuilder } from "discord.js";

import { type DbQueue, DISPLAY_TABLE } from "../../db/schema.ts";
import { DisplaysOption } from "../../options/options/displays.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { DisplayUtils } from "../../utils/display.utils.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { describeTable } from "../../utils/string.utils.ts";
import { ShowCommand } from "./show.command.ts";

export class DisplaysCommand extends AdminCommand {
	static readonly ID = "displays";

	displays_get = DisplaysCommand.displays_get;
	displays_add = DisplaysCommand.displays_add;
	displays_delete = DisplaysCommand.displays_delete;

	data = new SlashCommandBuilder()
		.setName(DisplaysCommand.ID)
		.setDescription("Manage display channels")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get a list of all queue displays");
			Object.values(DisplaysCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Alias for /show");
			Object.values(DisplaysCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Remove a queue display");
			Object.values(DisplaysCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /displays get
	// ====================================================================

	static readonly GET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Get displays of specific queue(s)" }),
	};

	static async displays_get(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		queues = queues ?? await DisplaysCommand.GET_OPTIONS.queues.get(inter);

		const displays = inter.store.dbDisplays().filter(display => queues.has(display.queueId));

		const descriptionMessage = describeTable({
			store: inter.store,
			table: DISPLAY_TABLE,
			tableLabel: "Displays",
			entryLabelProperty: "channelId",
			entries: [...displays.values()],
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /displays add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to display" }),
	};

	static async displays_add(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		queues = queues ?? await DisplaysCommand.ADD_OPTIONS.queues.get(inter);

		await ShowCommand.show(inter, queues);

		await this.displays_get(inter, queues);
	}

	// ====================================================================
	//                           /displays delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		displays: new DisplaysOption({ required: true, description: "Displays to delete" }),
	};

	static async displays_delete(inter: SlashInteraction) {
		const displays = await DisplaysCommand.DELETE_OPTIONS.displays.get(inter);

		const {
			deletedDisplays,
			updatedQueueIds,
		} = DisplayUtils.deleteDisplays(inter.store, displays.map(dis => dis.id));
		const queuesToUpdate = updatedQueueIds.map(id => inter.store.dbQueues().get(id));

		await inter.respond(`Deleted ${deletedDisplays.length} display${deletedDisplays.length === 1 ? "" : "s"}.`, true);

		await this.displays_get(inter, toCollection<bigint, DbQueue>("id", queuesToUpdate));
	}
}
