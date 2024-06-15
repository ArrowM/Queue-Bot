import { SlashCommandBuilder } from "discord.js";

import { MembersOption } from "../../options/options/members.option.ts";
import { NumberOption } from "../../options/options/number.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { ArchivedMemberReason } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";

export class PullCommand extends AdminCommand {
	static readonly ID = "pull";

	pull = PullCommand.pull;

	static readonly PULL_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to pull members from" }),
		count: new NumberOption({ description: "Number of queue members to pull", defaultValue: 1, minValue: 1 }),
		members: new MembersOption({ description: "Pull specific members instead of the next member" }),
	};

	data = new SlashCommandBuilder()
		.setName(PullCommand.ID)
		.setDescription("Pull members from queue(s)")
		.addStringOption(PullCommand.PULL_OPTIONS.queues.build)
		.addIntegerOption(PullCommand.PULL_OPTIONS.count.build)
		.addStringOption(PullCommand.PULL_OPTIONS.members.build);

	// ====================================================================
	//                           /pull
	// ====================================================================

	static async pull(inter: SlashInteraction) {
		const queues = await PullCommand.PULL_OPTIONS.queues.get(inter);
		const count = PullCommand.PULL_OPTIONS.count.get(inter);
		const members = await PullCommand.PULL_OPTIONS.members.get(inter);

		await MemberUtils.deleteMembers({
			store: inter.store,
			queues,
			reason: ArchivedMemberReason.Pulled,
			by: { userIds: members?.map((member) => member.userId), count },
			messageChannelId: inter.channel.id,
			force: true,
		});

		await inter.deleteReply();
	}
}
