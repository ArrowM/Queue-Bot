import { compact } from "lodash-es";

import { db } from "../db/db.ts";
import { type DbQueue, type NewQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import { DisplayUtils } from "./display.utils.ts";
import { MemberUtils } from "./member.utils.ts";
import { map } from "./misc.utils.ts";

export namespace QueueUtils {
	export async function insertQueue(store: Store, queue: NewQueue) {
		return await db.transaction(async () => {
			const insertedQueue = store.insertQueue(queue);

			if (queue?.roleInQueueId) {
				await QueueUtils.setRoleInQueue(store, [insertedQueue]);
			}

			return { insertedQueue };
		});
	}

	export async function updateQueues(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, update: Partial<DbQueue>) {
		return await db.transaction(async () => {
			const updatedQueues = compact(map(queues, queue => store.updateQueue({ id: queue.id, ...update })));
			const updatedQueueIds = updatedQueues.map(queue => queue.id);

			DisplayUtils.requestDisplaysUpdate({ store, queueIds: updatedQueueIds });

			if (update.roleInQueueId) {
				await QueueUtils.setRoleInQueue(store, updatedQueues);
			}

			return { updatedQueues };
		});
	}

	export async function setRoleInQueue(store: Store, queues: ArrayOrCollection<bigint, DbQueue>) {
		await Promise.all(
			map(queues, async (queue) => {
				const members = store.dbMembers().filter(member => member.queueId === queue.id);
				return Promise.all(
					members.map(async (member) =>
						await MemberUtils.modifyMemberRoles(store, member.userId, queue.roleInQueueId, "add")
					)
				);
			})
		);
	}
}