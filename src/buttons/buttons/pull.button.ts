import { ButtonStyle } from "discord.js";

import { AdminButton } from "../../types/button.types.ts";
import { ArchivedMemberReason } from "../../types/db.types.ts";
import type { ButtonInteraction } from "../../types/interaction.types.ts";
import { ButtonUtils } from "../../utils/button.utils.ts";
import { MemberUtils } from "../../utils/member.utils.ts";

export class PullButton extends AdminButton {
	static readonly ID = "pull";

	customId = PullButton.ID;
	label = "Pull";
	style = ButtonStyle.Primary;

	async handle(inter: ButtonInteraction) {
		const { queue } = await ButtonUtils.getButtonContext(inter);

		await MemberUtils.deleteMembers({
			store: inter.store,
			queues: [queue],
			reason: ArchivedMemberReason.Pulled,
			messageChannelId: inter.channel.id,
			force: true,
		});

		await inter.deleteReply();
	}
}