import { ButtonStyle } from "discord.js";

import { EveryoneButton } from "../../types/button.types.ts";
import type { ButtonInteraction } from "../../types/interaction.types.ts";
import { ButtonUtils } from "../../utils/button.utils.ts";
import { ClientUtils } from "../../utils/client.utils.ts";
import { queueMention } from "../../utils/string.utils.ts";

export class RenewButton extends EveryoneButton {
	static readonly ID = "renew";
	deferResponse = false;

	customId = RenewButton.ID;
	label = "🔄 Renew Queue Timer";
	style = ButtonStyle.Primary;

	async handle(inter: ButtonInteraction) {
		const { queue } = await ButtonUtils.getButtonContext(inter);
		const member = inter.store.dbMembers().find(m => m.queueId === queue.id && m.userId === inter.user.id);

		if (!member) {
			if (!inter.replied && !inter.deferred) {
				await inter.reply({ content: `You are not currently in the **${queue.name}** queue.` }).catch(() => null);
			}
			return;
		}

		// Reset joinTime to refresh member queue timer
		inter.store.updateMember({
			...member,
			joinTime: BigInt(Date.now()),
		});

		ClientUtils.WARNED_MEMBER_TIMEOUTS.delete(`${queue.id}_${inter.user.id}`);

		console.log(`[DEBUG TIMEOUT] Member ${inter.user.tag ?? inter.user.username} RENEWED their queue timer for "${queue.name}".`);

		if (!inter.replied && !inter.deferred) {
			await inter.reply({ content: `✅ Your queue timer for the **${queue.name}** queue has been renewed!` }).catch(() => null);
		}
	}
}
