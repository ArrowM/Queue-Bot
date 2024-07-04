import { SlashCommandBuilder } from "discord.js";

import { DmMemberOption } from "../../options/options/dm-member.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { MemberRemovalReason } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { queuesMention } from "../../utils/string.utils.ts";

export class ClearCommand extends AdminCommand {
	static readonly ID = "clear";

	clear = ClearCommand.clear;

	static readonly CLEAR_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to clear" }),
		dmMember: new DmMemberOption({ description: "Whether to directly message the member(s)" }),
	};

	data = new SlashCommandBuilder()
		.setName(ClearCommand.ID)
		.setDescription("Remove all members from queue(s). (same as /members delete ALL)")
		.addStringOption(ClearCommand.CLEAR_OPTIONS.queues.build)
		.addBooleanOption(ClearCommand.CLEAR_OPTIONS.dmMember.build);

	// ====================================================================
	//                           /clear
	// ====================================================================

	static async clear(inter: SlashInteraction) {
		const queues = await ClearCommand.CLEAR_OPTIONS.queues.get(inter);
		const dmMember = ClearCommand.CLEAR_OPTIONS.dmMember.get(inter);

		const confirmed = await inter.promptConfirmOrCancel(`Are you sure you want to remove all members from the ${queuesMention(queues)} queue${queues.size > 1 ? "s" : ""}?`);
		if (!confirmed) {
			await inter.respond("Cancelled clear.");
			return;
		}

		await MemberUtils.deleteMembers({
			store: inter.store,
			queues,
			reason: MemberRemovalReason.Kicked,
			messageChannelId: inter.channelId,
			by: { count: 9999 },
			force: true,
			dmMember,
		});

		await inter.deleteReply();
	}
}
