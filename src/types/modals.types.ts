import type { ModalBuilder } from "discord.js";

import type { ModalInteraction } from "./interaction.types.ts";

export interface Modal {
	getModal(data: any): ModalBuilder;

	handle(inter: ModalInteraction): Promise<void>;
}