import { SlashCommandBuilder } from "discord.js";

import { QueryUtils } from "../../db/queries.ts";
import { ADMIN_TABLE } from "../../db/schema.ts";
import { AdminsOption } from "../../options/options/admins.option.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { EveryoneCommand } from "../../types/command.types.ts";
import { Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { AdminUtils } from "../../utils/admin.utils.ts";
import { describeTable, mentionablesMention } from "../../utils/string.utils.ts";

export class AdminsCommand extends EveryoneCommand {
	static readonly ID = "admins";

	admins_get = AdminsCommand.admins_get;
	admins_add = AdminsCommand.admins_add;
	admins_delete = AdminsCommand.admins_delete;

	data = new SlashCommandBuilder()
		.setName(AdminsCommand.ID)
		.setDescription("Manage admin users and roles")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get admin users and roles");
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Grant admin status to users and roles");
			Object.values(AdminsCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Revoke admin status from users and roles");
			Object.values(AdminsCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /admins get
	// ====================================================================

	static async admins_get(inter: SlashInteraction) {
		const admins = QueryUtils.selectManyAdmins({ guildId: inter.guildId });

		const descriptionMessage = describeTable({
			store: inter.store,
			table: ADMIN_TABLE,
			tableLabel: "Admins",
			entryLabelProperty: "subjectId",
			entries: admins,
			color: Color.DarkRed,
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /admins add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		mentionable1: new MentionableOption({ required: true, name: "mentionable_1", description: "User or role to grant admin status to" }),
		mentionable2: new MentionableOption({ name: "mentionable_2", description: "User or role to grant admin status to" }),
		mentionable3: new MentionableOption({ name: "mentionable_3", description: "User or role to grant admin status to" }),
		mentionable4: new MentionableOption({ name: "mentionable_4", description: "User or role to grant admin status to" }),
		mentionable5: new MentionableOption({ name: "mentionable_5", description: "User or role to grant admin status to" }),
	};

	static async admins_add(inter: SlashInteraction) {
		const mentionables = [
			AdminsCommand.ADD_OPTIONS.mentionable1.get(inter),
			AdminsCommand.ADD_OPTIONS.mentionable2.get(inter),
			AdminsCommand.ADD_OPTIONS.mentionable3.get(inter),
			AdminsCommand.ADD_OPTIONS.mentionable4.get(inter),
			AdminsCommand.ADD_OPTIONS.mentionable5.get(inter),
		];

		const insertedAdmins = AdminUtils.insertAdmins(inter.store, mentionables);

		await inter.respond(`Granted Queue Bot admin access to ${mentionablesMention(insertedAdmins)}.`, true);

		await this.admins_get(inter);
	}

	// ====================================================================
	//                           /admins delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		admins: new AdminsOption({ required: true, description: "User or role to revoke admin status from" }),
	};

	static async admins_delete(inter: SlashInteraction) {
		const admins = await AdminsCommand.DELETE_OPTIONS.admins.get(inter);

		const deletedAdmins = AdminUtils.deleteAdmins(inter.store, admins.map(admin => admin.id));

		await inter.respond(`Revoked Queue Bot admin access from ${mentionablesMention(deletedAdmins)}.`, true);

		await this.admins_get(inter);
	}
}
