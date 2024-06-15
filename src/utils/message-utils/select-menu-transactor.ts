import {
	ActionRowBuilder,
	type ApplicationCommandOptionChoiceData,
	Collection,
	ComponentType,
	EmbedBuilder,
	StringSelectMenuBuilder,
	type StringSelectMenuInteraction,
	StringSelectMenuOptionBuilder,
} from "discord.js";

import { MAX_SELECT_MENU_OPTIONS } from "../../types/handler.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import type { ArrayOrCollection } from "../../types/misc.types.ts";

export class SelectMenuTransactor {
	protected userResponse: StringSelectMenuInteraction;

	constructor(protected inter: SlashInteraction) {
	}

	async sendAndReceive(label: string, options: ApplicationCommandOptionChoiceData[]): Promise<string[]> {
		try {
			// send
			const selectMenuMessage = await this.inter.respond({
				components: [
					new ActionRowBuilder<StringSelectMenuBuilder>({
						components: [this.createStringSelectMenu(label, options)],
					}),
				],
			});

			// receive
			this.userResponse = await selectMenuMessage.awaitMessageComponent<ComponentType.StringSelect>({
				filter: int => (int.user.id === this.inter.user.id) && (int.customId === label),
				time: 60000, // 1 minute
			});
			return this.userResponse.values;
		}
		catch {
			await this.inter.editReply({
				content: "Confirmation not received within 1 minute, cancelling",
				components: [],
			});
		}
	}

	async updateWithResult(title: string, selection: ArrayOrCollection<any, any> | string) {
		let description;
		if (typeof selection === "string") {
			description = selection;
		}
		else if (selection instanceof Collection) {
			description = `Selected ${selection.map(v => v.toString()).join(", ")}.`;
		}
		else {
			description = `Selected ${selection.map(v => v.toString()).join(", ")}.`;
		}

		const embed = new EmbedBuilder()
			.setTitle(title)
			.setDescription(description);

		const resultMessage = await this.userResponse.update({
			content: "",
			embeds: [embed],
			components: [],
		});

		return { embed, resultMessage };
	}

	private createStringSelectMenu(label: string, options: ApplicationCommandOptionChoiceData[]) {
		return new StringSelectMenuBuilder()
			.setCustomId(label)
			.setPlaceholder(label)
			.addOptions(options
				.slice(0, MAX_SELECT_MENU_OPTIONS)
				.map(option =>
					new StringSelectMenuOptionBuilder()
						.setLabel(option.name)
						.setValue(`${option.value}`),
				),
			)
			.setMinValues(1)
			.setMaxValues(options.length);
	}
}