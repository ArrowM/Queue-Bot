import { SlashCommandBuilder } from "discord.js";

import { JoinModal } from "../../modals/join.modal.ts";
import { MessageOption } from "../../options/options/message.option.ts";
import { QueueOption } from "../../options/options/queue.option.ts";
import { EveryoneCommand } from "../../types/command.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { queueMention } from "../../utils/string.utils.ts";

export class JoinCommand extends EveryoneCommand {
	static readonly ID = "join";

	join = JoinCommand.join;
	deferResponse = false;

	static readonly JOIN_OPTIONS = {
		queue: new QueueOption({ required: true, description: "Queue to join" }),
		message: new MessageOption({ description: "Message to display next to your name in the queue" }),
	};

	data = new SlashCommandBuilder()
		.setName(JoinCommand.ID)
		.setDescription("Join a queue")
		.addStringOption(JoinCommand.JOIN_OPTIONS.queue.build)
		.addStringOption(JoinCommand.JOIN_OPTIONS.message.build);

	// ====================================================================
	//                           /join
	// ====================================================================

	static async join(inter: SlashInteraction) {
		const queue = await JoinCommand.JOIN_OPTIONS.queue.get(inter);
		const message = JoinCommand.JOIN_OPTIONS.message.get(inter);

		if (queue.requireMessageToJoin && !message) {
			await inter.showModal(JoinModal.getModal({ queueId: queue.id }));
		}
		else {
			await MemberUtils.insertMember({ store: inter.store, queue, jsMember: inter.member, message });

			await inter.respond({
				content: `Joined the ${queueMention(queue)} queue.`,
				embeds: [await MemberUtils.getMemberDisplayLine(inter.store, queue, inter.member.id)],
				ephemeral: true,
			}, true);
		}
	}
}
