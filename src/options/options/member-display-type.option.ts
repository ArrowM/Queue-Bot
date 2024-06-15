import { MemberDisplayType } from "../../types/db.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { toChoices } from "../../utils/misc.utils.ts";
import { StringOption } from "../base-option.ts";

export class MemberDisplayTypeOption extends StringOption {
	static readonly ID = "member_display_type";
	id = MemberDisplayTypeOption.ID;
	defaultValue = MemberDisplayType.Mention;
	choices = toChoices(MemberDisplayType);

	// force return type to be MemberDisplayType
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as MemberDisplayType;
	}
}
