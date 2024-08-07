import { type Collection, SlashCommandBuilder } from "discord.js";
import { compact } from "lodash-es";

import type { DbQueue } from "../../db/schema.ts";
import { DmMemberOption } from "../../options/options/dm-member.option.ts";
import { MembersOption } from "../../options/options/members.option.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { MessageOption } from "../../options/options/message.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { MemberRemovalReason } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { ChoiceType } from "../../types/parsing.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { queuesMention, usersMention } from "../../utils/string.utils.ts";
import { ShowCommand } from "./show.command.ts";

export class MembersCommand extends AdminCommand {
	static readonly ID = "members";

	members_get = MembersCommand.members_get;
	members_add = MembersCommand.members_add;
	members_set = MembersCommand.members_set;
	members_delete = MembersCommand.members_delete;

	data = new SlashCommandBuilder()
		.setName(MembersCommand.ID)
		.setDescription("Manage queue members")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Alias for /show");
			Object.values(MembersCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Add users or roles to a queue");
			Object.values(MembersCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set")
				.setDescription("Update a queue member message");
			Object.values(MembersCommand.SET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Kick members from a queue");
			Object.values(MembersCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		});

	// ====================================================================
	//                           /members get
	// ====================================================================

	static readonly GET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to display" }),
	};

	static async members_get(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		await ShowCommand.show(inter, queues);
	}

	// ====================================================================
	//                           /members add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to add members to" }),
		mentionable1: new MentionableOption({ id: "mentionable_1", required: true, description: "User or role to add" }),
		mentionable2: new MentionableOption({ id: "mentionable_2", description: "User or role to add" }),
		mentionable3: new MentionableOption({ id: "mentionable_3", description: "User or role to add" }),
		mentionable4: new MentionableOption({ id: "mentionable_4", description: "User or role to add" }),
		mentionable5: new MentionableOption({ id: "mentionable_5", description: "User or role to add" }),
		dmMember: new DmMemberOption({ description: "Whether to directly message the member(s)" }),
	};

	static async members_add(inter: SlashInteraction) {
		const queues = await MembersCommand.ADD_OPTIONS.queues.get(inter);
		const mentionables = compact([
			MembersCommand.ADD_OPTIONS.mentionable1.get(inter),
			MembersCommand.ADD_OPTIONS.mentionable2.get(inter),
			MembersCommand.ADD_OPTIONS.mentionable3.get(inter),
			MembersCommand.ADD_OPTIONS.mentionable4.get(inter),
			MembersCommand.ADD_OPTIONS.mentionable5.get(inter),
		]);
		const dmMember = MembersCommand.ADD_OPTIONS.dmMember.get(inter);

		await MemberUtils.insertMentionables({
			store: inter.store,
			mentionables,
			queues,
			force: true,
			dmMember,
		});
	}

	// ====================================================================
	//                           /members set
	// ====================================================================

	static readonly SET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) of members to update" }),
		members: new MembersOption({ required: true, description: "Members to update" }),
		message: new MessageOption({ description: "New message of the member" }),
	};

	static async members_set(inter: SlashInteraction) {
		const queues = await MembersCommand.SET_OPTIONS.queues.get(inter);
		const members = await MembersCommand.SET_OPTIONS.members.get(inter);
		const message = MembersCommand.SET_OPTIONS.message.get(inter);

		const updatedMembers = MemberUtils.updateMembers({ store: inter.store, members, message });

		await inter.respond(`Updated ${usersMention(updatedMembers)} in ${queuesMention(queues)} queue${queues.size > 1 ? "s" : ""}.`, true);
	}

	// ====================================================================
	//                           /members delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to kick members from" }),
		members: new MembersOption({ required: true, description: "Members to kick" }),
		dmMember: new DmMemberOption({ description: "Whether to directly message the member(s)" }),
	};

	static async members_delete(inter: SlashInteraction) {
		const queues = await MembersCommand.DELETE_OPTIONS.queues.get(inter);
		const members = await MembersCommand.DELETE_OPTIONS.members.get(inter);
		const dmMember = MembersCommand.DELETE_OPTIONS.dmMember.get(inter);

		if (MembersCommand.DELETE_OPTIONS.members.getRaw(inter) === ChoiceType.ALL) {
			const confirmed = await inter.promptConfirmOrCancel(`Are you sure you want to remove all members from the ${queuesMention(queues)} queue${queues.size > 1 ? "s" : ""}?`);
			if (!confirmed) {
				await inter.respond("Cancelled delete.");
				return;
			}
		}

		await MemberUtils.deleteMembers({
			store: inter.store,
			queues,
			reason: MemberRemovalReason.Kicked,
			by: { userIds: members.map(member => member.userId) },
			messageChannelId: inter.channel.id,
			force: true,
			dmMember,
		});
	}
}
