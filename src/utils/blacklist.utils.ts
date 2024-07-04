import { type GuildMember, Role } from "discord.js";
import { compact, uniq } from "lodash-es";

import { db } from "../db/db.ts";
import type { DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import { MemberRemovalReason } from "../types/db.types.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { MemberUtils } from "./member.utils.ts";
import { filterDbObjectsOnJsMember, map } from "./misc.utils.ts";

export namespace BlacklistUtils {
	export async function insertBlacklisted(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, mentionables: Mentionable[], reason?: string) {
		return db.transaction(async () => {
			const insertedBlacklisted = compact(
				map(queues, queue =>
					mentionables.map(mentionable => {
						// remove members from queue
						const by = (mentionable instanceof Role) ? { roleId: mentionable.id } : { userId: mentionable.id };
						MemberUtils.deleteMembers({ store, queues, reason: MemberRemovalReason.Kicked, by, force: true });

						return store.insertBlacklisted({
							guildId: store.guild.id,
							queueId: queue.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							reason,
						});
					})
				)
			).flat(2);
			const updatedQueueIds = uniq(insertedBlacklisted.map(blacklisted => blacklisted.queueId));

			return { insertedBlacklisted, updatedQueueIds };
		});
	}

	export function deleteBlacklisted(store: Store, blacklistedIds: bigint[]) {
		const deletedBlacklisted = compact(blacklistedIds.map(id => store.deleteBlacklisted({ id })));
		const updatedQueueIds = uniq(deletedBlacklisted.map(blacklisted => blacklisted.queueId));
		return { deletedBlacklisted, updatedQueueIds };
	}

	export function isBlockedByBlacklist(store: Store, queueId: bigint, jsMember: GuildMember): boolean {
		const blacklistedOfQueue = store.dbBlacklisted().filter(blacklisted => blacklisted.queueId == queueId);
		const blacklistedOfMember = filterDbObjectsOnJsMember(blacklistedOfQueue, jsMember);
		return blacklistedOfMember.size > 0;
	}
}