import { SlashCommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";

import { db } from "../../db/db.ts";
import {
	ADMIN_TABLE,
	ARCHIVED_MEMBER_TABLE,
	BLACKLISTED_TABLE,
	MEMBER_TABLE,
	PRIORITIZED_TABLE,
	WHITELISTED_TABLE,
} from "../../db/schema.ts";
import { EveryoneCommand } from "../../types/command.types.ts";
import { MemberRemovalReason } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { MemberUtils } from "../../utils/member.utils.ts";

export class DeleteMyDataCommand extends EveryoneCommand {
	static readonly ID = "delete-my-data";

	delete_my_data = DeleteMyDataCommand.delete_my_data;

	data = new SlashCommandBuilder()
		.setName(DeleteMyDataCommand.ID)
		.setDescription("Permanently delete all of your data stored by Queue Bot, in every server");

	// ====================================================================
	//                           /delete-my-data
	// ====================================================================

	static async delete_my_data(inter: SlashInteraction) {
		const confirmed = await inter.promptConfirmOrCancel(
			"This will permanently remove you from all queues in every server and delete all data " +
			"Queue Bot stores about you (queue positions, messages, history, and any admin, whitelist, blacklist, or priority entries for you). " +
			"This cannot be undone."
		);
		if (!confirmed) {
			await inter.respond("Cancelled. No data was deleted.");
			return;
		}

		const userId = inter.user.id;

		// Remove from the current server's queues properly so displays and roles are updated
		await MemberUtils.deleteMembers({
			store: inter.store,
			queues: inter.store.dbQueues(),
			reason: MemberRemovalReason.Left,
			by: { userId },
			force: true,
		});

		db.transaction(() => {
			db.delete(MEMBER_TABLE).where(eq(MEMBER_TABLE.userId, userId)).run();
			db.delete(ARCHIVED_MEMBER_TABLE).where(eq(ARCHIVED_MEMBER_TABLE.userId, userId)).run();
			db.delete(ADMIN_TABLE).where(and(eq(ADMIN_TABLE.subjectId, userId), eq(ADMIN_TABLE.isRole, false))).run();
			db.delete(BLACKLISTED_TABLE).where(and(eq(BLACKLISTED_TABLE.subjectId, userId), eq(BLACKLISTED_TABLE.isRole, false))).run();
			db.delete(WHITELISTED_TABLE).where(and(eq(WHITELISTED_TABLE.subjectId, userId), eq(WHITELISTED_TABLE.isRole, false))).run();
			db.delete(PRIORITIZED_TABLE).where(and(eq(PRIORITIZED_TABLE.subjectId, userId), eq(PRIORITIZED_TABLE.isRole, false))).run();
		});

		await inter.respond("All of your data has been deleted. Database backups are automatically purged within 7 days.");
	}
}
