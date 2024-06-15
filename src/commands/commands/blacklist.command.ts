import { type Collection, SlashCommandBuilder } from "discord.js";

import { BLACKLISTED_TABLE, type DbQueue } from "../../db/schema.ts";
import { BlacklistedsOption } from "../../options/options/blacklisteds.option.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { ReasonOption } from "../../options/options/reason.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { BlacklistUtils } from "../../utils/blacklist.utils.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { describeTable, mentionableMention, mentionablesMention, queuesMention } from "../../utils/string.utils.ts";

export class BlacklistCommand extends AdminCommand {
	static readonly ID = "blacklist";

	blacklist_get = BlacklistCommand.blacklist_get;
	blacklist_add = BlacklistCommand.blacklist_add;
	blacklist_delete = BlacklistCommand.blacklist_delete;

	data = new SlashCommandBuilder()
		.setName(BlacklistCommand.ID)
		.setDescription("Manage blacklisted users and roles")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get blacklisted users and roles");
			Object.values(BlacklistCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Blacklist users and roles");
			Object.values(BlacklistCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Un-blacklist users and roles");
			Object.values(BlacklistCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /blacklist get
	// ====================================================================

	static readonly GET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Get blacklisted entries of specific queue(s)" }),
	};

	static async blacklist_get(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		queues = queues ?? await BlacklistCommand.GET_OPTIONS.queues.get(inter);

		const blacklisted = inter.store.dbBlacklisted().filter(blacklisted => queues.has(blacklisted.queueId));

		const descriptionMessage = describeTable({
			store: inter.store,
			table: BLACKLISTED_TABLE,
			tableLabel: "Blacklisted members and roles",
			entryLabelProperty: "subjectId",
			entries: [...blacklisted.values()],
			color: Color.Black,
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /blacklist add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to blacklist from" }),
		mentionable1: new MentionableOption({ required: true, name: "mentionable_1", description: "User or role to blacklist" }),
		mentionable2: new MentionableOption({ name: "mentionable_2", description: "User or role to blacklist" }),
		mentionable3: new MentionableOption({ name: "mentionable_3", description: "User or role to blacklist" }),
		mentionable4: new MentionableOption({ name: "mentionable_4", description: "User or role to blacklist" }),
		mentionable5: new MentionableOption({ name: "mentionable_5", description: "User or role to blacklist" }),
		reason: new ReasonOption({ description: "Reason for blacklisting" }),
	};

	static async blacklist_add(inter: SlashInteraction) {
		const queues = await BlacklistCommand.ADD_OPTIONS.queues.get(inter);
		const mentionables = [
			BlacklistCommand.ADD_OPTIONS.mentionable1.get(inter),
			BlacklistCommand.ADD_OPTIONS.mentionable2.get(inter),
			BlacklistCommand.ADD_OPTIONS.mentionable3.get(inter),
			BlacklistCommand.ADD_OPTIONS.mentionable4.get(inter),
			BlacklistCommand.ADD_OPTIONS.mentionable5.get(inter),
		];
		const reason = BlacklistCommand.ADD_OPTIONS.reason.get(inter);

		const {
			updatedQueueIds,
			insertedBlacklisted,
		} = await BlacklistUtils.insertBlacklisted(inter.store, queues, mentionables, reason);
		const updatedQueues = updatedQueueIds.map(id => inter.store.dbQueues().get(id));

		await inter.respond(`Blacklisted ${mentionablesMention(insertedBlacklisted)} from the '${queuesMention(updatedQueues)}' queue${updatedQueues.length > 1 ? "s" : ""}.`, true);
		await this.blacklist_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /blacklist delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		blacklisteds: new BlacklistedsOption({
			required: true,
			description: "Blacklisted users and roles to un-blacklist",
		}),
	};

	static async blacklist_delete(inter: SlashInteraction) {
		const blacklisteds = await BlacklistCommand.DELETE_OPTIONS.blacklisteds.get(inter);

		const {
			updatedQueueIds,
		} = BlacklistUtils.deleteBlacklisted(inter.store, blacklisteds.map(blacklisted => blacklisted.id));
		const updatedQueues = updatedQueueIds.map(id => inter.store.dbQueues().get(id));

		await inter.respond(`Un-blacklisted ${blacklisteds.map(mentionableMention).join(", ")}.`, true);
		await this.blacklist_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}
}
