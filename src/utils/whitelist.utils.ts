import { type GuildMember, Role } from "discord.js";
import { compact, uniq } from "lodash-es";

import { db } from "../db/db.ts";
import type { DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { filterDbObjectsOnJsMember, map } from "./misc.utils.ts";

export namespace WhitelistUtils {
	export function insertWhitelisted(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, mentionables: Mentionable[], reason?: string) {
		return db.transaction(() => {
			const insertedWhitelisted = compact(
				map(queues, queue =>
					mentionables.map(mentionable =>
						store.insertWhitelisted({
							guildId: store.guild.id,
							queueId: queue.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							reason,
						})
					)
				)
			).flat(2);
			const updatedQueueIds = uniq(insertedWhitelisted.map(whitelisted => whitelisted.queueId));

			return { insertedWhitelisted, updatedQueueIds };
		});
	}

	export function deleteWhitelisted(store: Store, whitelistedIds: bigint[]) {
		const deletedWhitelisted = compact(whitelistedIds.map(id => store.deleteWhitelisted({ id })));
		const updatedQueueIds = uniq(deletedWhitelisted.map(whitelisted => whitelisted.queueId));
		return { deletedWhitelisted, updatedQueueIds };
	}

	export function isBlockedByWhitelist(store: Store, queueId: bigint, jsMember: GuildMember): boolean {
		const whitelistedOfQueue = store.dbWhitelisted().filter(whitelisted => queueId === whitelisted.queueId);
		if (whitelistedOfQueue.size === 0) return false;
		const whitelistedOfMember = filterDbObjectsOnJsMember(whitelistedOfQueue, jsMember);
		return whitelistedOfMember.size === 0;
	}
}