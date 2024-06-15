import { type Collection, SlashCommandBuilder } from "discord.js";

import { type DbQueue, WHITELISTED_TABLE } from "../../db/schema.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { ReasonOption } from "../../options/options/reason.option.ts";
import { WhitelistedsOption } from "../../options/options/whitelisteds.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { describeTable, mentionableMention, mentionablesMention, queuesMention } from "../../utils/string.utils.ts";
import { WhitelistUtils } from "../../utils/whitelist.utils.ts";

export class WhitelistCommand extends AdminCommand {
	static readonly ID = "whitelist";

	whitelist_get = WhitelistCommand.whitelist_get;
	whitelist_add = WhitelistCommand.whitelist_add;
	whitelist_delete = WhitelistCommand.whitelist_delete;

	data = new SlashCommandBuilder()
		.setName(WhitelistCommand.ID)
		.setDescription("Manage whitelisted users and roles")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get whitelisted users and roles");
			Object.values(WhitelistCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Whitelist users and roles");
			Object.values(WhitelistCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Un-whitelist users and roles");
			Object.values(WhitelistCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /whitelist get
	// ====================================================================

	static readonly GET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Get whitelist entries of specific queue(s)" }),
	};

	static async whitelist_get(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		queues = queues ?? await WhitelistCommand.GET_OPTIONS.queues.get(inter);

		const whitelisted = inter.store.dbWhitelisted().filter(whitelisted => queues.has(whitelisted.queueId));

		const descriptionMessage = describeTable({
			store: inter.store,
			table: WHITELISTED_TABLE,
			tableLabel: "Whitelisted members and roles",
			entryLabelProperty: "subjectId",
			entries: [...whitelisted.values()],
			color: Color.White,
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /whitelist add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to whitelist in" }),
		mentionable1: new MentionableOption({ required: true, name: "mentionable_1", description: "User or role to whitelist" }),
		mentionable2: new MentionableOption({ name: "mentionable_2", description: "User or role to whitelist" }),
		mentionable3: new MentionableOption({ name: "mentionable_3", description: "User or role to whitelist" }),
		mentionable4: new MentionableOption({ name: "mentionable_4", description: "User or role to whitelist" }),
		mentionable5: new MentionableOption({ name: "mentionable_5", description: "User or role to whitelist" }),
		reason: new ReasonOption({ description: "Reason for whitelisting" }),
	};

	static async whitelist_add(inter: SlashInteraction) {
		const queues = await WhitelistCommand.ADD_OPTIONS.queues.get(inter);
		const mentionables = [
			WhitelistCommand.ADD_OPTIONS.mentionable1.get(inter),
			WhitelistCommand.ADD_OPTIONS.mentionable2.get(inter),
			WhitelistCommand.ADD_OPTIONS.mentionable3.get(inter),
			WhitelistCommand.ADD_OPTIONS.mentionable4.get(inter),
			WhitelistCommand.ADD_OPTIONS.mentionable5.get(inter),
		];
		const reason = WhitelistCommand.ADD_OPTIONS.reason.get(inter);

		const {
			updatedQueueIds,
			insertedWhitelisted,
		} = WhitelistUtils.insertWhitelisted(inter.store, queues, mentionables, reason);
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		await inter.respond(`Whitelisted ${mentionablesMention(insertedWhitelisted)} in the '${queuesMention(updatedQueues)}' queue${updatedQueues.length > 1 ? "s" : ""}.`, true);
		await this.whitelist_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /whitelist delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		whitelisteds: new WhitelistedsOption({
			required: true,
			description: "Whitelisted users and roles to un-whitelist",
		}),
	};

	static async whitelist_delete(inter: SlashInteraction) {
		const whitelisteds = await WhitelistCommand.DELETE_OPTIONS.whitelisteds.get(inter);

		const {
			updatedQueueIds,
		} = WhitelistUtils.deleteWhitelisted(inter.store, whitelisteds.map(whitelisted => whitelisted.id));
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		await inter.respond(`Un-whitelisted ${whitelisteds.map(mentionableMention).join(", ")}.`, true);
		await this.whitelist_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}
}
