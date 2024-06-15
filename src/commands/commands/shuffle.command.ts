import { SlashCommandBuilder } from "discord.js";

import { QueuesOption } from "../../options/options/queues.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { queuesMention } from "../../utils/string.utils.ts";

export class ShuffleCommand extends AdminCommand {
	static readonly ID = "shuffle";

	shuffle = ShuffleCommand.shuffle;

	static readonly SHUFFLE_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to shuffle" }),
	};

	data = new SlashCommandBuilder()
		.setName(ShuffleCommand.ID)
		.setDescription("Shuffle queue(s)")
		.addStringOption(ShuffleCommand.SHUFFLE_OPTIONS.queues.build);

	// ====================================================================
	//                           /shuffle
	// ====================================================================

	static async shuffle(inter: SlashInteraction) {
		const queues = await ShuffleCommand.SHUFFLE_OPTIONS.queues.get(inter);

		const confirmed = await inter.promptConfirmOrCancel(`Are you sure you want to shuffle the '${queuesMention(queues)}' queue${queues.size > 1 ? "s" : ""}?`);
		if (!confirmed) {
			await inter.respond("Cancelled shuffle");
			return;
		}

		for (const queue of queues.values()) {
			await MemberUtils.shuffleMembers(inter.store, queue, inter.channelId);
		}

		await inter.deleteReply();
	}
}
