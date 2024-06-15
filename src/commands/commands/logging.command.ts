import { bold, channelMention, EmbedBuilder, inlineCode, SlashCommandBuilder } from "discord.js";

import { LogChannelOption } from "../../options/options/log-channel.option.ts";
import { LogScopeOption } from "../../options/options/log-scope.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";

export class LoggingCommand extends AdminCommand {
	static readonly ID = "logging";

	logging_get = LoggingCommand.logging_get;
	logging_set = LoggingCommand.logging_set;
	logging_reset = LoggingCommand.logging_disable;

	data = new SlashCommandBuilder()
		.setName("logging")
		.setDescription("Manage logging settings")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get logging settings");
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set")
				.setDescription("Set logging settings");
			Object.values(LoggingCommand.SET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("disable")
				.setDescription("Disables logging");
			return subcommand;
		});

	// ====================================================================
	//                           /logging get
	// ====================================================================

	static async logging_get(inter: SlashInteraction) {
		const dbGuild = inter.store.dbGuild();

		const embed = new EmbedBuilder()
			.setTitle("Logging")
			.setColor(Color.LightGrey);

		if (dbGuild.logChannelId && dbGuild.logScope) {
			embed.setDescription(`- Log Channel = ${channelMention(dbGuild.logChannelId)}\n- Log Scope = ${inlineCode(dbGuild.logScope)}`);
		}
		else {
			embed.setDescription("No logging configured");
		}

		await inter.respond({ embeds: [embed] });
	}

	// ====================================================================
	//                           /logging set
	// ====================================================================

	static readonly SET_OPTIONS = {
		logChannel: new LogChannelOption({ required: true, description: "Channel to log messages in" }),
		logScope: new LogScopeOption({ required: true, description: "Scope of messages to log" }),
	};

	static async logging_set(inter: SlashInteraction) {
		const logChannelId = LoggingCommand.SET_OPTIONS.logChannel.get(inter)?.id;
		const logScope = LoggingCommand.SET_OPTIONS.logScope.get(inter);

		inter.store.updateGuild({ logChannelId, logScope });

		await inter.respond(`Logging ${bold(logScope)} messages in ${channelMention(logChannelId)}.`, true);
		await LoggingCommand.logging_get(inter);
	}

	// ====================================================================
	//                           /logging disable
	// ====================================================================

	static async logging_disable(inter: SlashInteraction) {
		inter.store.updateGuild({ logChannelId: null, logScope: null });

		await inter.respond("Disabled logging.", true);
	}
}