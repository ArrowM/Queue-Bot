import { type Role } from "discord.js";
import { get } from "lodash-es";

import { db } from "../db/db.ts";
import { type DbQueue, type NewQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import { DisplayUtils } from "./display.utils.ts";
import { MemberUtils } from "./member.utils.ts";
import { map } from "./misc.utils.ts";

export namespace QueueUtils {
	export async function insertQueue(store: Store, queue: NewQueue) {
		const insertedQueue = store.insertQueue(queue);

		const role = get(queue, "role") as Role;
		if (role) {
			await MemberUtils.assignInQueueRoleToMembers(store, [insertedQueue], role.id, "add");
		}

		return { insertedQueue };
	}

	export async function updateQueues(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, update: Partial<DbQueue>) {
		return await db.transaction(async () => {
			const updatedQueues = map(queues, queue => store.updateQueue({ id: queue.id, ...update }));
			const updatedQueueIds = updatedQueues.map(queue => queue.id);

			DisplayUtils.requestDisplaysUpdate(store, updatedQueueIds);

			if (update.roleInQueueId) {
				await MemberUtils.assignInQueueRoleToMembers(store, updatedQueues, update.roleInQueueId, "add");
			}

			return { updatedQueues };
		});
	}
}