import { codeBlock, EmbedBuilder, type Interaction } from "discord.js";
import { compact, concat } from "lodash-es";

import { Store } from "../db/store.ts";
import { Color } from "../types/db.types.ts";
import type { Handler } from "../types/handler.types.ts";
import type { AnyInteraction } from "../types/interaction.types.ts";
import { CustomError } from "../utils/error.utils.ts";
import { InteractionUtils } from "../utils/interaction.utils.ts";
import { ERROR_HEADER_LINE } from "../utils/string.utils.ts";
import { AutocompleteHandler } from "./autocomplete.handler.ts";
import { ButtonHandler } from "./button.handler.ts";
import { CommandHandler } from "./command.handler.ts";

export class InteractionHandler implements Handler {
	private readonly inter: AnyInteraction;

	constructor(inter: Interaction) {
		InteractionUtils.verifyCommandIsFromGuild(inter);
		this.inter = inter as any as AnyInteraction;
		this.inter.store = new Store(this.inter.guild, this.inter);
	}

	async handle() {
		try {
			if (this.inter.isChatInputCommand()) {
				await new CommandHandler(this.inter).handle();
			}
			else if (this.inter.isAutocomplete()) {
				await new AutocompleteHandler(this.inter).handle();
			}
			else if (this.inter.isButton()) {
				await new ButtonHandler(this.inter).handle();
			}
		}
		catch (e) {
			await this.handleInteractionError(e as any);
		}
	}

	private async handleInteractionError(error: Error | string) {
		const { stack, embeds, log } = error as CustomError;
		const message = typeof error === "string" ? error : error.message;

		// Only skip log if explicitly set to false
		const doLog = log !== false;

		if (message === "Unknown interaction") return;

		try {
			if (doLog) {
				console.error(`Error (guildId=${this.inter.guildId}): ${message}`);
				console.error(`Stack Trace: ${stack}`);
			}

			if ("respond" in this.inter) {
				const embed = new EmbedBuilder()
					.setTitle(ERROR_HEADER_LINE)
					.setColor(Color.DarkRed)
					.setDescription(message ? `${codeBlock(message)}` : "an unknown error occurred");
				if (doLog) {
					embed.setFooter({ text: "This error has been logged and will be investigated by the developers." });
				}

				await this.inter.respond({
					embeds: compact(concat(embeds, embed)),
					ephemeral: true,
				});
			}
		}
		catch (handlingError) {
			console.log();
			console.log("An Error occurred during handling of another error:");
			console.error(handlingError);
		}
	}
}