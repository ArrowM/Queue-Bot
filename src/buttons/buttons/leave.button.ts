import { ButtonStyle } from "discord.js";

import { EveryoneButton } from "../../types/button.types.ts";
import { MemberRemovalReason } from "../../types/db.types.ts";
import type { ButtonInteraction } from "../../types/interaction.types.ts";
import { ButtonUtils } from "../../utils/button.utils.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { queueMention } from "../../utils/string.utils.ts";

export class LeaveButton extends EveryoneButton {
	static readonly ID = "leave";

	customId = LeaveButton.ID;
	label = "Leave";
	style = ButtonStyle.Danger;

	async handle(inter: ButtonInteraction) {
		const { queue } = await ButtonUtils.getButtonContext(inter);
		const deletedMembers = await MemberUtils.deleteMembers({
			store: inter.store,
			queues: [queue],
			reason: MemberRemovalReason.Left,
			by: { userId: inter.member.id },
		});

		await inter.respond(`Left the ${queueMention(queue)} queue.`, deletedMembers.length > 0);
	}
}