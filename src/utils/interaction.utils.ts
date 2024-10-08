import {
	ActionRowBuilder,
	bold,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	type GuildTextBasedChannel,
	inlineCode,
	type InteractionReplyOptions,
	type Message,
	PermissionsBitField,
} from "discord.js";

import { Color } from "../types/db.types.ts";
import type { ButtonInteraction, ModalInteraction, SlashInteraction } from "../types/interaction.types.ts";
import { CustomError } from "./error.utils.ts";
import { LoggingUtils } from "./message-utils/logging.utils.ts";

export namespace InteractionUtils {
	export async function respond(
		inter: SlashInteraction | ButtonInteraction | ModalInteraction,
		isAdmin: boolean,
		message: InteractionReplyOptions | string,
		log = false,
	) {
		try {
			const interaction = inter as any;

			let response: Message;
			if (interaction.replied) {
				response = await interaction.followUp(message);
			}
			else if (interaction.deferred) {
				response = await interaction.editReply(message);
			}
			else {
				response = await (await interaction.reply(message)).fetch();
			}

			const logChannelId = inter.store.dbGuild().logChannelId;
			const isAlreadySentToLogChannel = !inter.ephemeral && logChannelId && response.channel.id === logChannelId;
			if (log && !isAlreadySentToLogChannel) {
				await LoggingUtils.log(inter.store, isAdmin, response);
			}

			return response;
		}
		catch {
			// nothing
		}
	}

	const CANCEL_BUTTON = new ButtonBuilder()
		.setCustomId("cancel")
		.setLabel("Cancel")
		.setStyle(ButtonStyle.Secondary);

	const CONFIRM_BUTTON = new ButtonBuilder()
		.setCustomId("confirm")
		.setLabel("Confirm")
		.setStyle(ButtonStyle.Danger);

	export async function promptConfirmOrCancel(inter: SlashInteraction, message: string): Promise<boolean> {
		const response = await inter.respond({
			content: message,
			components: [
				new ActionRowBuilder<ButtonBuilder>({ components: [CANCEL_BUTTON, CONFIRM_BUTTON] }),
			],
		});
		let confirmation;

		try {
			confirmation = await response.awaitMessageComponent<ComponentType.Button>({
				filter: i => i.user.id === inter.user.id,
				time: 60_000,
			}).catch(() => null);
		}
		catch {
			// nothing
		}
		finally {
			await inter.editReply({ components: [] }).catch(() => null);
		}

		return confirmation?.customId === "confirm";
	}

	export async function verifyCanSendMessages(jsChannel: GuildTextBasedChannel) {
		function throwPermissionError(permissionName: string) {
			throw new CustomError({
				message: "Missing Permissions",
				embeds: [
					new EmbedBuilder()
						.setTitle(`⚠️ I am missing the ${inlineCode(permissionName)} permission in ${jsChannel} ⚠️ ️️️️`)
						.setDescription(`Please open the '${bold(jsChannel.guild.name)}' server, hover over ${jsChannel}, click the gear, click 'Permissions', and ensure I have the ${inlineCode(permissionName)} permission.`)
						.setColor(Color.Red),
				],
			});
		}

		const me = await jsChannel.guild.members.fetchMe();
		const perms = jsChannel?.permissionsFor(me);
		if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) {
			throwPermissionError("View Channel");
		}
		if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
			throwPermissionError("Send Messages");
		}
	}
}
