import { type Collection, SlashCommandBuilder } from "discord.js";

import type { DbQueue } from "../../db/schema.ts";
import { MembersOption } from "../../options/options/members.option.ts";
import { MentionableOption } from "../../options/options/mentionable.option.ts";
import { MessageOption } from "../../options/options/message.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { ArchivedMemberReason } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { NotificationAction } from "../../types/notification.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { NotificationUtils } from "../../utils/notification.utils.ts";
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
			Object.values(MembersCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
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
				.setDescription("Remove members from a queue");
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
		mentionable1: new MentionableOption({ name: "mentionable_1", required: true, description: "User or role to add" }),
		mentionable2: new MentionableOption({ name: "mentionable_2", description: "User or role to add" }),
		mentionable3: new MentionableOption({ name: "mentionable_3", description: "User or role to add" }),
		mentionable4: new MentionableOption({ name: "mentionable_4", description: "User or role to add" }),
		mentionable5: new MentionableOption({ name: "mentionable_5", description: "User or role to add" }),
	};

	static async members_add(inter: SlashInteraction) {
		const queues = await MembersCommand.ADD_OPTIONS.queues.get(inter);
		const mentionables = [
			MembersCommand.ADD_OPTIONS.mentionable1.get(inter),
			MembersCommand.ADD_OPTIONS.mentionable2.get(inter),
			MembersCommand.ADD_OPTIONS.mentionable3.get(inter),
			MembersCommand.ADD_OPTIONS.mentionable4.get(inter),
			MembersCommand.ADD_OPTIONS.mentionable5.get(inter),
		];

		const insertedMembers = await MemberUtils.insertMentionables(inter.store, mentionables, queues);

		const message = await inter.respond(`Added ${usersMention(insertedMembers)} to '${queuesMention(queues)}' queue${queues.size > 1 ? "s" : ""}.`, true);

		for (const queue of queues.values()) {
			await NotificationUtils.dmToMembers({
				store: inter.store,
				queue,
				action: NotificationAction.ADDED_TO_QUEUE,
				members: insertedMembers,
				messageLink: message.url,
			});
		}

		const updatedQueues = insertedMembers.map(inserted => inter.store.dbQueues().get(inserted.queueId));
		await MembersCommand.members_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
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

		const updatedMembers = MemberUtils.updateMembers(inter.store, members, message);

		await inter.respond(`Updated ${usersMention(updatedMembers)} in '${queuesMention(queues)}' queue${queues.size > 1 ? "s" : ""}.`, true);

		const updatedQueues = updatedMembers.map(updated => queues.get(updated.queueId));
		await MembersCommand.members_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /members delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to remove members from" }),
		members: new MembersOption({ required: true, description: "Members to remove" }),
	};

	static async members_delete(inter: SlashInteraction) {
		const queues = await MembersCommand.DELETE_OPTIONS.queues.get(inter);
		const members = await MembersCommand.DELETE_OPTIONS.members.get(inter);

		const deletedMembers = await MemberUtils.deleteMembers({
			store: inter.store,
			queues,
			reason: ArchivedMemberReason.Kicked,
			by: { userIds: members.map(member => member.userId) },
			messageChannelId: inter.channel.id,
			force: true,
		});

		await inter.respond(`Removed ${usersMention(deletedMembers)} from '${queuesMention(queues)}' queue${queues.size > 1 ? "s" : ""}.`, true);

		const updatedQueues = deletedMembers.map(deleted => inter.store.dbQueues().get(deleted.queueId));
		await MembersCommand.members_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}
}
