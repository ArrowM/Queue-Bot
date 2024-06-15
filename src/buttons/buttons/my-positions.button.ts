import { ButtonStyle } from "discord.js";

import { EveryoneButton } from "../../types/button.types.ts";
import type { ButtonInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";

export class MyPositionsButton extends EveryoneButton {
	static readonly ID = "my_positions";

	customId = MyPositionsButton.ID;
	label = "My Positions";
	style = ButtonStyle.Secondary;

	async handle(inter: ButtonInteraction) {
		await inter.respond({ embeds: await MemberUtils.describeMyPositions(inter.store, inter.member.id) });
	}
}