import type { Collection } from "discord.js";

import type { DbAdmin } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { AdminNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class AdminOption extends CustomOption {
	static readonly ID = "admin";
	id = AdminOption.ID;

	getAutocompletions = AdminOption.getAutocompletions;

	// force return type to be DbAdmin
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbAdmin>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(AdminOption.ID);
		if (!inputString) return;

		return AdminOption.findAdmin(inter.store.dbAdmins(), inputString);
	}

	static findAdmin(admins: Collection<bigint, DbAdmin>, idString: string): DbAdmin {
		try {
			const admin = admins.get(BigInt(idString));
			if (admin) {
				return admin;
			}
			else {
				throw new AdminNotFoundError();
			}
		}
		catch {
			throw new AdminNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;

		const suggestions: UIOption[] = [];
		for (const admin of inter.store.dbAdmins().values()) {
			const name = admin.isRole
				? (await inter.store.jsRole(admin.subjectId)).name
				: (await inter.store.jsMember(admin.subjectId)).displayName;
			suggestions.push({
				name: `'${name}' ${admin.isRole ? "role" : "user"}`,
				value: admin.id.toString(),
			});
		}
		return suggestions;
	}
}