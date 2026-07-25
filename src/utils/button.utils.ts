import { Queries } from "../db/queries.ts";
import type { ButtonInteraction } from "../types/interaction.types.ts";
import { DisplayNotFoundError } from "./error.utils.ts";

export namespace ButtonUtils {
	export async function getButtonContext(inter: ButtonInteraction) {
		const customId = inter.customId;
		if (customId?.startsWith("renew:")) {
			const queueId = BigInt(customId.split(":")[1]);
			const queue = Queries.selectAllQueues().find(q => q.id === queueId);
			if (!queue) {
				throw new DisplayNotFoundError();
			}
			return { display: null as any, queue };
		}

		const display = Queries.selectDisplay({ guildId: inter.guild.id, lastMessageId: inter.message.id });
		if (!display) {
			throw new DisplayNotFoundError();
		}
		const queue = Queries.selectQueue({ guildId: inter.guild.id, id: display.queueId });
		return { display, queue };
	}
}
