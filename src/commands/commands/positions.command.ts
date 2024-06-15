import { SlashCommandBuilder } from "discord.js";

import { EveryoneCommand } from "../../types/command.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";

export class PositionsCommand extends EveryoneCommand {
	static readonly ID = "positions";

	positions = PositionsCommand.positions;

	data = new SlashCommandBuilder()
		.setName(PositionsCommand.ID)
		.setDescription("Get your positions in all queues");

	// ====================================================================
	//                           /positions
	// ====================================================================

	static async positions(inter: SlashInteraction) {
		await inter.respond({ embeds: await MemberUtils.describeMyPositions(inter.store, inter.member.id) });
	}
}
