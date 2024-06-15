import { Collection } from "discord.js";

import type { DbAdmin } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { AdminOption } from "./admin.option.ts";

export class AdminsOption extends CustomOption {
	static readonly ID = "admins";
	id = AdminsOption.ID;
	extraChoices = [CHOICE_ALL, CHOICE_SOME];

	getAutocompletions = AdminOption.getAutocompletions;

	// force return type to be DbAdmin
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbAdmin>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(AdminsOption.ID);
		if (!inputString) return;

		const admins = inter.store.dbAdmins();

		switch (inputString) {
			case CHOICE_ALL.value:
				return admins;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, admins);
			default:
				const admin = AdminOption.findAdmin(admins, inputString);
				return admin ? new Collection([[admin.id, admin]]) : null;
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, admins: Collection<bigint, DbAdmin>): Promise<Collection<bigint, DbAdmin>> {
		// build menu
		const label = AdminsOption.ID;
		const options = admins.map(admin => ({
			name: admin.toString(),
			value: admin.id.toString(),
		}));

		// send and receive
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);

		// parse result
		const adminIds = result.map(id => BigInt(id));
		const selectedAdmins = admins.filter(admin => adminIds.includes(admin.id));

		// write result
		await selectMenuTransactor.updateWithResult(label, selectedAdmins);

		return selectedAdmins;
	}
}