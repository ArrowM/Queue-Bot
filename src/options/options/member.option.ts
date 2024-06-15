import type { Collection } from "discord.js";

import type { DbMember } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { MemberNotFoundError } from "../../utils/error.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class MemberOption extends CustomOption {
	static readonly ID = "queue_member";
	id = MemberOption.ID;

	getAutocompletions = MemberOption.getAutocompletions;

	// force return type to be DbMember
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbMember>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(MemberOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const members = inter.parser.getScopedMembers(queues);

		return MemberOption.findMember(members, inputString);
	}

	static findMember(members: Collection<bigint, DbMember>, idString: string): DbMember {
		try {
			const member = members.get(BigInt(idString));
			if (member) {
				return member;
			}
			else {
				throw new MemberNotFoundError();
			}
		}
		catch {
			throw new MemberNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const members = inter.parser.getScopedMembers(queues);

		const suggestions: UIOption[] = [];
		for (const member of members.values()) {
			const name = (await inter.store.jsMember(member.userId)).displayName;
			suggestions.push({
				name: `'${name}' in '${queues.get(member.queueId).name}' queue`,
				value: member.id.toString(),
			});
		}
		return suggestions;
	}
}
