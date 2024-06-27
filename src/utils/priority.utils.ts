import { Collection, type GuildMember, Role } from "discord.js";
import { compact, min, uniq } from "lodash-es";

import { db } from "../db/db.ts";
import type { DbPrioritized, DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { Mentionable } from "../types/parsing.types.ts";
import { DisplayUtils } from "./display.utils.ts";
import { filterDbObjectsOnJsMember } from "./misc.utils.ts";

export namespace PriorityUtils {
	export function insertPrioritized(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, mentionables: Mentionable[], priorityOrder?: bigint, reason?: string) {
		const result = db.transaction(() => {
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
						})
					);
				}
			}
			const updatedQueueIds = uniq(compact(insertedPrioritized).map(prioritized => prioritized.queueId));

			return { insertedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function updatePrioritized(store: Store, prioritizedIds: bigint[], update: Partial<DbPrioritized>) {
		const result = db.transaction(() => {
			const updatedPrioritized = prioritizedIds.map(id => store.updatePrioritized({ id, ...update }));
			const updatedQueueIds = uniq(compact(updatedPrioritized).map(prioritized => prioritized.queueId));
			return { updatedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function deletePrioritized(store: Store, prioritizedIds: bigint[]) {
		const result = db.transaction(() => {
			const deletedPrioritized = prioritizedIds.map(id => store.deletePrioritized({ id }));
			const updatedQueueIds = uniq(compact(deletedPrioritized).map(prioritized => prioritized.queueId));
			return { deletedPrioritized, updatedQueueIds };
		});

		reEvaluatePrioritized(store, result.updatedQueueIds);

		return result;
	}

	export function getMemberPriority(store: Store, queueId: bigint, jsMember: GuildMember): bigint | null {
		const prioritizedOfQueue = store.dbPrioritized().filter(prioritized => queueId === prioritized.queueId);
		const prioritizedOfMember = filterDbObjectsOnJsMember(prioritizedOfQueue, jsMember);
		return prioritizedOfMember.size ? min(prioritizedOfMember.map(prioritized => prioritized.priorityOrder)) : null;
	}

	async function reEvaluatePrioritized(store: Store, queueIds: bigint[]) {
		for (const queueId of queueIds) {
			const members = store.dbMembers().filter(member => member.queueId === queueId);
			for (const member of members.values()) {
				const jsMember = await store.jsMember(member.userId);
				const priorityOrder = getMemberPriority(store, queueId, jsMember);
				store.updateMember({ ...member, priorityOrder });
			}
		}
		DisplayUtils.requestDisplaysUpdate(store, queueIds);
	}
}