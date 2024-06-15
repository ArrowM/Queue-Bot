import { ButtonStyle } from "discord.js";

import type { ButtonInteraction } from "./interaction.types.ts";

export interface Button {
	customId: string;
	label: string;
	style: ButtonStyle;
	handle: (inter: ButtonInteraction) => Promise<void>;
	adminOnly: boolean;
}

abstract class ButtonBase implements Button {
	readonly adminOnly: boolean;

	abstract customId: string;
	abstract label: string;
	abstract style: ButtonStyle;

	abstract handle(inter: ButtonInteraction): Promise<void>;
}

export abstract class EveryoneButton extends ButtonBase {
	readonly adminOnly = false;
}

export abstract class AdminButton extends ButtonBase {
	readonly adminOnly = true;
}