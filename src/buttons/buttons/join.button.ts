import { ButtonStyle } from "discord.js";

import { JoinModal } from "../../modals/join.modal.ts";
import { EveryoneButton } from "../../types/button.types.ts";
import type { ButtonInteraction } from "../../types/interaction.types.ts";
import { ButtonUtils } from "../../utils/button.utils.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { queueMention } from "../../utils/string.utils.ts";

export class JoinButton extends EveryoneButton {
	static readonly ID = "join";
	deferResponse = false;

	customId = JoinButton.ID;
	label = "Join";
	style = ButtonStyle.Success;

	async handle(inter: ButtonInteraction) {
		const { queue } = await ButtonUtils.getButtonContext(inter);

		if (queue.requireMessageToJoin) {
			await inter.showModal(JoinModal.getModal({ queueId: queue.id }));
		}
		else {
			await MemberUtils.insertMember({ store: inter.store, queue, jsMember: inter.member });

			await inter.respond({
				content: `Joined the ${queueMention(queue)} queue.`,
				embeds: [await MemberUtils.getMemberDisplayLine(inter.store, queue, inter.member.id)],
				ephemeral: true,
			}, true);
		}
	}
}