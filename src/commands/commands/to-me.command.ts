import { SlashCommandBuilder } from "discord.js";

import { MembersOption } from "../../options/options/members.option.ts";
import { NumberOption } from "../../options/options/number.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { MemberRemovalReason } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { PullCommand } from "./pull.command.ts";

export class ToMeCommand extends AdminCommand {
	static readonly ID = "to-me";

	to_me = ToMeCommand.to_me;

	static readonly TO_ME_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to pull from" }),
		count: new NumberOption({ description: "Number of queue members to pull", defaultValue: 1, minValue: 1 }),
		members: new MembersOption({ description: "Pull specific members instead of the next member" }),
	};

	data = new SlashCommandBuilder()
		.setName(ToMeCommand.ID)
		.setDescription("Pull members from queue(s) to your voice channel")
		.addStringOption(PullCommand.PULL_OPTIONS.queues.build)
		.addIntegerOption(PullCommand.PULL_OPTIONS.count.build)
		.addStringOption(PullCommand.PULL_OPTIONS.members.build);

	// ====================================================================
	//                           /toMe
	// ====================================================================

	static async to_me(inter: SlashInteraction) {
		const queues = await PullCommand.PULL_OPTIONS.queues.get(inter);
		const count = PullCommand.PULL_OPTIONS.count.get(inter);
		const members = await PullCommand.PULL_OPTIONS.members.get(inter);

		const destinationChannelId = inter.member.voice?.channelId;
		if (!destinationChannelId) {
			await inter.respond("You must be in a voice channel to use this command");
			return;
		}

		await MemberUtils.deleteMembers({
			store: inter.store,
			queues,
			reason: MemberRemovalReason.Pulled,
			by: { userIds: members?.map((member) => member.userId), count },
			messageChannelId: inter.channel.id,
			destinationChannelId,
			force: true,
		});

		await inter.deleteReply();
	}
}
