import { Collection } from "discord.js";

import type { DbMember } from "../../db/schema.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../../types/parsing.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { CustomOption } from "../base-option.ts";
import { MemberOption } from "./member.option.ts";

export class MembersOption extends CustomOption {
	static readonly ID = "queue_members";
	id = MembersOption.ID;
	extraChoices = [CHOICE_ALL];

	getAutocompletions = MemberOption.getAutocompletions;

	// force return type to be Collection<bigint, DbMember>
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<Collection<bigint, DbMember>>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(MembersOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const members = inter.parser.getScopedMembers(queues);

		switch (inputString) {
			case CHOICE_ALL.value:
				return members;
			case CHOICE_SOME.value:
				return await this.getViaSelectMenu(inter as SlashInteraction, members);
			default:
				const member = MemberOption.findMember(members, inputString);
				return member ? new Collection([[member.id, member]]) : null;
		}
	}

	protected async getViaSelectMenu(inter: SlashInteraction, members: Collection<bigint, DbMember>): Promise<Collection<bigint, DbMember>> {
		const memberIds = members.map((member) => member.userId);
		const jsMembers = await inter.store.jsMembers(memberIds);

		// build menu
		const label = MembersOption.ID;
		const options = jsMembers.map(member => ({
			name: member.displayName,
			value: member.id,
		}));

		// send and receive
		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const result = await selectMenuTransactor.sendAndReceive(label, options);

		// parse result
		const resultIds = result.map(id => BigInt(id));
		const selectedMembers = members.filter(member => resultIds.includes(member.id));

		// write result
		await selectMenuTransactor.updateWithResult(label, selectedMembers);

		return selectedMembers;
	}
}
