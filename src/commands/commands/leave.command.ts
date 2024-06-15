import { SlashCommandBuilder } from "discord.js";

import { QueueOption } from "../../options/options/queue.option.ts";
import { EveryoneCommand } from "../../types/command.types.ts";
import { ArchivedMemberReason } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { queueMention } from "../../utils/string.utils.ts";

export class LeaveCommand extends EveryoneCommand {
	static readonly ID = "leave";

	leave = LeaveCommand.leave;

	static readonly LEAVE_OPTIONS = {
		queue: new QueueOption({ required: true, description: "Queue to leave" }),
	};

	data = new SlashCommandBuilder()
		.setName(LeaveCommand.ID)
		.setDescription("Leave a queue")
		.addStringOption(LeaveCommand.LEAVE_OPTIONS.queue.build);

	// ====================================================================
	//                           /leave
	// ====================================================================

	static async leave(inter: SlashInteraction) {
		const queue = await LeaveCommand.LEAVE_OPTIONS.queue.get(inter);

		await MemberUtils.deleteMembers({
			store: inter.store,
			queues: [queue],
			reason: ArchivedMemberReason.Left,
			by: { userId: inter.member.id },
			force: true,
		});

		await inter.respond(`Left the '${queueMention(queue)}' queue.`, true);
	}
}
