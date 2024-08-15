import type { InteractionReplyOptions } from "discord.js";

import { JoinModal } from "../modals/join.modal.ts";
import type { Handler } from "../types/handler.types.ts";
import type { BaseInteraction, ModalInteraction } from "../types/interaction.types.ts";
import { InteractionUtils } from "../utils/interaction.utils.ts";

export class ModalHandler implements Handler {
	private readonly inter: ModalInteraction;

	constructor(inter: BaseInteraction) {
		this.inter = inter as any as ModalInteraction;
	}

	async handle() {
		this.inter.respond = (message: InteractionReplyOptions | string, log = false) => InteractionUtils.respond(this.inter, false, message, log);

		if (this.inter.customId.startsWith(JoinModal.ID)) {
			await JoinModal.handle(this.inter);
		}
	}
}