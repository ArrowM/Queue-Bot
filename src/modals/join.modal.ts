import { ActionRowBuilder, type ModalActionRowComponentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";

import type { ModalInteraction } from "../types/interaction.types.ts";
import { MemberUtils } from "../utils/member.utils.ts";
import { ModalUtils } from "../utils/modal.utils.ts";
import { queueMention } from "../utils/string.utils.ts";

export namespace JoinModal {
	export const ID = "join";

	const MESSAGE_FIELD_ID = "message";

	export function getModal({ queueId }: { queueId: bigint }) {
		const customId = ModalUtils.encodeCustomId(ID, queueId);
		const modal = new ModalBuilder()
			.setCustomId(customId)
			.setTitle("Your Queue Message");

		const memberMessageInput = new TextInputBuilder()
			.setCustomId(MESSAGE_FIELD_ID)
			.setLabel("What's your message?")
			.setPlaceholder("This will be displayed next to your name in the queue")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);

		const actionRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(memberMessageInput);
		modal.addComponents(actionRow);

		return modal;
	}

	export async function handle(inter: ModalInteraction) {
		const message = inter.fields.getTextInputValue(MESSAGE_FIELD_ID);
		const { queueId } = ModalUtils.decodeCustomId(inter.customId);

		const queue = inter.store.dbQueues().get(queueId);

		await MemberUtils.insertMember({ store: inter.store, queue, jsMember: inter.member, message });

		await inter.respond({
			content: `Joined the ${queueMention(queue)} queue.`,
			embeds: [await MemberUtils.getMemberDisplayLine(inter.store, queue, inter.member.id)],
		}, true);
	}
}
