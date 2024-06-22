import { SlashCommandBuilder } from "discord.js";

import { UserOption } from "../../options/base-option.ts";
import { EveryoneCommand } from "../../types/command.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";

export class PositionsCommand extends EveryoneCommand {
	static readonly ID = "positions";

	positions = PositionsCommand.positions;

	static readonly POSTITIONS_OPTIONS = {
		user: new UserOption({ description: "User to get positions for" }),
	};

	data = new SlashCommandBuilder()
		.setName(PositionsCommand.ID)
		.setDescription("Get your positions in all queues")
		.addUserOption(PositionsCommand.POSTITIONS_OPTIONS.user.build);

	// ====================================================================
	//                           /positions
	// ====================================================================

	static async positions(inter: SlashInteraction) {
		const user = PositionsCommand.POSTITIONS_OPTIONS.user.get(inter) ?? inter.user;

		await inter.respond({ embeds: await MemberUtils.describeMemberPositions(inter.store, user.id) });
	}
}
