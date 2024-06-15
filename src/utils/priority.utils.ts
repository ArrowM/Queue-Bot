import { Collection, type GuildMember, Role } from "discord.js";
import { min, uniq } from "lodash-es";

import { db } from "../db/db.ts";
import type { DbPrioritized, DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { DisplayUtils } from "./display.utils.ts";
import { filterDbObjectsOnJsMember } from "./misc.utils.ts";

export namespace PriorityUtils {
	export function insertPrioritized(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, mentionables: Mentionable[], priorityOrder?: number, reason?: string) {
		return db.transaction(() => {
			const _queues = queues instanceof Collection ? [...queues.values()] : queues;
			const insertedPrioritized = [];

			for (const mentionable of mentionables) {
				for (const queue of _queues) {
					insertedPrioritized.push(
						store.insertPrioritized({
							guildId: store.guild.id,
							queueId: queue.id,
							subjectId: mentionable.id,
							isRole: mentionable instanceof Role,
							priorityOrder,
							reason,
						}),
					);
				}
			}
			const updatedQueueIds = uniq(insertedPrioritized.map(prioritized => prioritized.queueId));

			reEvaluatePrioritized(store, updatedQueueIds);

			return { insertedPrioritized, updatedQueueIds };
		});
	}

	export function updatePrioritized(store: Store, prioritizedIds: bigint[], update: Partial<DbPrioritized>) {
		return db.transaction(() => {
			const updatedPrioritized = prioritizedIds.map(id => store.updatePrioritized({ id, ...update }));
			const updatedQueueIds = uniq(updatedPrioritized.map(prioritized => prioritized.queueId));

			reEvaluatePrioritized(store, updatedQueueIds);

			return { updatedPrioritized, updatedQueueIds };
		});
	}

	export function deletePrioritized(store: Store, prioritizedIds: bigint[]) {
		return db.transaction(() => {
			const deletedPrioritized = prioritizedIds.map(id => store.deletePrioritized({ id }));
			const updatedQueueIds = uniq(deletedPrioritized.map(prioritized => prioritized.queueId));

			reEvaluatePrioritized(store, updatedQueueIds);

			return { deletedPrioritized, updatedQueueIds };
		});
	}

	export function getMemberPriority(store: Store, queueId: bigint, jsMember: GuildMember): number | null {
		const prioritizedOfQueue = store.dbPrioritized().filter(prioritized => queueId === prioritized.queueId);
		const prioritizedOfMember = filterDbObjectsOnJsMember(prioritizedOfQueue, jsMember);
		return prioritizedOfMember.size ? min(prioritizedOfMember.map(prioritized => prioritized.priorityOrder)) : undefined;
	}

	async function reEvaluatePrioritized(store: Store, queueIds: bigint[]) {
		for (const queueId of queueIds) {
			const members = store.dbMembers().filter(member => member.queueId === queueId);
			for (const member of members.values()) {
				const jsMember = await store.jsMember(member.userId);
				const priority = getMemberPriority(store, queueId, jsMember);
				store.updateMember({ ...member, priority });
			}
		}
		DisplayUtils.requestDisplaysUpdate(store, queueIds);
	}
}