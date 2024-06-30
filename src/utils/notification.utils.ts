import { map } from "lodash-es";

import type { DbMember, DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import { NotificationAction } from "../types/notification.types.ts";
import { queueMention } from "./string.utils.ts";

export namespace NotificationUtils {
	export async function dmToMembers(options: {
		store: Store,
		queue: DbQueue,
		action: NotificationAction,
		members: DbMember[],
		link?: string,
	}) {
		const { store, queue, action, members, link } = options;

		// build message
		const linkStr = link ? `${link} ` : "";
		let message = `${linkStr}You were just ${action} the ${queueMention(queue)} queue.`;
		if (queue.pullMessage) {
			message += `\n> ${queue.pullMessage}`;
		}

		// send and do not wait
		Promise.all(
			map(members, member => {
				store.jsMember(member.userId).then(member => {
					member?.user?.send(message).catch(() => null);
				});
			})
		);
	}
}