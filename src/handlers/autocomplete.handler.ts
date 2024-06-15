import { OPTIONS } from "../options/options.loader.ts";
import { type Handler, MAX_SLASH_COMMAND_OPTIONS, type UIOption } from "../types/handler.types.ts";
import type { AnyInteraction, AutocompleteInteraction } from "../types/interaction.types.ts";
import { CHOICE_ALL, CHOICE_SOME } from "../types/parsing.types.ts";
import { Parser } from "../utils/message-utils/parser.ts";

export class AutocompleteHandler implements Handler {
	private readonly inter: AutocompleteInteraction;

	constructor(inter: AnyInteraction) {
		this.inter = inter as AutocompleteInteraction;
		this.inter.parser = new Parser(this.inter);
	}

	async handle() {
		const focusedOption = this.inter.options.getFocused(true);
		const lowerSearchText = focusedOption.value.toLowerCase();

		const option = OPTIONS.get(focusedOption.name);

		const suggestions = await option.getAutocompletions({ inter: this.inter, lowerSearchText }) as UIOption[];
		suggestions.sort((a, b) => a.name.localeCompare(b.name));

		if (option.extraChoices?.includes(CHOICE_SOME) && suggestions.length > 2) {
			suggestions.unshift(CHOICE_SOME);
		}
		if (option.extraChoices?.includes(CHOICE_ALL) && suggestions.length > 1) {
			suggestions.unshift(CHOICE_ALL);
		}

		const filteredSuggestions = suggestions
			.filter(suggestion => suggestion.name.toLowerCase().includes(lowerSearchText))
			.slice(0, MAX_SLASH_COMMAND_OPTIONS);

		await this.inter.respond(filteredSuggestions);
	}
}