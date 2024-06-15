import { ApplicationCommandOptionBase } from "@discordjs/builders";
import type {
	APIApplicationCommandOptionChoice,
	ChannelType,
	PublicThreadChannel,
	Role,
	SlashCommandBooleanOption,
	SlashCommandBuilder,
	SlashCommandChannelOption,
	SlashCommandIntegerOption,
	SlashCommandMentionableOption,
	SlashCommandRoleOption,
	SlashCommandStringOption,
	SlashCommandSubcommandBuilder,
} from "discord.js";
import { SQL } from "drizzle-orm";

import type { UIOption } from "../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../types/interaction.types.ts";
import type { OptionParams } from "../types/option.types.ts";
import { type CHOICE_ALL, CHOICE_SOME, type Mentionable } from "../types/parsing.types.ts";

export abstract class BaseOption<BuilderType extends ApplicationCommandOptionBase = any> {
	// id
	id: string;
	// display name of option in Discord UI
	_name: string;
	// description of option in Discord UI
	description: string;
	// whether the option should be autocompleted
	autocomplete?: boolean;
	// types of channels that can be selected
	channelTypes?: readonly ChannelType[];
	// choices for the option
	choices?: APIApplicationCommandOptionChoice<number | string>[];
	// extra values to add to the choices
	extraChoices?: (typeof CHOICE_ALL | typeof CHOICE_SOME)[];
	// default value for the option (shown in description)
	defaultValue?: any;
	// minimum value for number options
	minValue?: number;
	// whether the option is required
	required?: boolean;

	get name() {
		return this._name ?? this.id;
	}

	constructor(config?: OptionParams) {
		this._name = config?.name;
		this.description = config?.description;
		this.autocomplete = config?.autocomplete ?? this.autocomplete;
		this.channelTypes = config?.channelTypes ?? this.channelTypes;
		this.choices = config?.choices ?? this.choices;
		this.extraChoices = config?.extraChoices ?? this.extraChoices;
		this.defaultValue = config?.defaultValue ?? this.defaultValue;
		this.minValue = config?.minValue ?? this.minValue;
		this.required = config?.required ?? this.required;
	}

	get(inter: AutocompleteInteraction | SlashInteraction): unknown {
		let selection = inter.parser.cache.get(this.name);
		if (selection == undefined) {
			selection = this.getUncached(inter);
			inter.parser.cache.set(this.name, selection);
		}
		return selection;
	}

	build = (optionBuilder: BuilderType): BuilderType => {
		optionBuilder
			.setName(this.name)
			.setDescription(this.buildDescription());
		if (this.required) {
			optionBuilder.setRequired(this.required);
		}
		if (this.autocomplete) {
			(optionBuilder as any).setAutocomplete(this.autocomplete);
		}
		if (this.choices) {
			(optionBuilder as any).setChoices(...this.choices);
		}
		if (this.channelTypes) {
			(optionBuilder as any).addChannelTypes(...this.channelTypes);
		}
		if (this.minValue != undefined) {
			(optionBuilder as any).setMinValue(this.minValue);
		}

		return optionBuilder;
	};

	getAutocompletions?(options: AutoCompleteOptions): Promise<unknown[]>;

	abstract addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void;

	protected abstract getUncached(inter: AutocompleteInteraction | SlashInteraction): unknown;

	private buildDescription(): string {
		let description = this.description;
		if (this.defaultValue != undefined) {
			description += ` [default: ${this.defaultValue}]`;
		}
		if (description.length > 100) {
			throw new Error(`Error creating option ${this.name}. description length must be <= 100 (attempted: ${description.length})`);
		}
		return description;
	}
}

export interface AutoCompleteOptions {
	inter: AutocompleteInteraction;
	lowerSearchText: string;
}

export abstract class CustomOption extends BaseOption<SlashCommandStringOption> {
	abstract id: string;
	autocomplete = true;

	addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void {
		command.addStringOption(this.build);
	}

	abstract getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]>;

	protected abstract getUncached(inter: AutocompleteInteraction | SlashInteraction): Promise<unknown>;
}

export abstract class StringOption extends BaseOption<SlashCommandStringOption> {
	abstract id: string;

	addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void {
		command.addStringOption(this.build);
	}

	// force return type to be string
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as string;
	}

	protected getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getString(this.name);
	}
}

export abstract class BooleanOption extends BaseOption<SlashCommandBooleanOption> {
	abstract id: string;
	abstract defaultValue: boolean | SQL<unknown>;

	addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void {
		command.addBooleanOption(this.build);
	}

	// force return type to be boolean
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as boolean;
	}

	protected getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getBoolean(this.name);
	}
}

export abstract class IntegerOption extends BaseOption<SlashCommandIntegerOption> {
	abstract id: string;

	addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void {
		command.addIntegerOption(this.build);
	}

	// force return type to be number
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as number;
	}

	protected getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getInteger(this.name);
	}
}

export abstract class ChannelOption extends BaseOption<SlashCommandChannelOption> {
	abstract id: string;

	addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void {
		command.addChannelOption(this.build);
	}

	// force return type to be PublicThreadChannel
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as PublicThreadChannel;
	}

	protected getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return (inter as SlashInteraction).options.getChannel(this.name);
	}
}

export abstract class RoleOption extends BaseOption<SlashCommandRoleOption> {
	abstract id: string;

	addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void {
		command.addRoleOption(this.build);
	}

	// force return type to be Role | APIRole
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Role;
	}

	protected getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return (inter as SlashInteraction).options.getRole(this.name);
	}
}

export abstract class MentionableOption extends BaseOption<SlashCommandMentionableOption> {
	abstract id: string;

	addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void {
		command.addMentionableOption(this.build);
	}

	// force return type to be Mentionable
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Mentionable;
	}

	protected getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return (inter as SlashInteraction).options.getMentionable(this.name);
	}
}
