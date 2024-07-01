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
	SlashCommandSubcommandBuilder, SlashCommandUserOption, User,
} from "discord.js";
import { SQL } from "drizzle-orm";

import type { UIOption } from "../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../types/interaction.types.ts";
import type { OptionParams } from "../types/option.types.ts";
import { type CHOICE_ALL, CHOICE_SOME, type Mentionable } from "../types/parsing.types.ts";

export abstract class BaseOption<BuilderType extends ApplicationCommandOptionBase = any> {
	// id & display name of option in Discord UI
	id: string;
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

	get identifier() {
		return this.config?.id ?? this.id;
	}

	constructor(
		public config?: OptionParams
	) { }

	get(inter: AutocompleteInteraction | SlashInteraction): unknown {
		let selection = inter.parser.cache.get(this.identifier);
		if (selection == undefined) {
			selection = this.getUncached(inter);
			inter.parser.cache.set(this.identifier, selection);
		}
		if (selection == undefined && (this.config?.required ?? this.required)) {
			throw new Error(`Required option ${this.identifier} not found`);
		}
		return selection;
	}

	build = (optionBuilder: BuilderType): BuilderType => {
		const id = this.identifier;
		const autocomplete = this.config?.autocomplete ?? this.autocomplete;
		const channelTypes = this.config?.channelTypes ?? this.channelTypes;
		const choices = this.config?.choices ?? this.choices;
		const minValue = this.config?.minValue ?? this.minValue;
		const required = this.config?.required ?? this.required;

		optionBuilder.setName(id).setDescription(this.buildDescription());

		if (required) {
			optionBuilder.setRequired(required);
		}
		if (autocomplete) {
			(optionBuilder as any).setAutocomplete(autocomplete);
		}
		if (choices) {
			(optionBuilder as any).setChoices(...choices);
		}
		if (channelTypes) {
			(optionBuilder as any).addChannelTypes(...channelTypes);
		}
		if (minValue != undefined) {
			(optionBuilder as any).setMinValue(minValue);
		}

		return optionBuilder;
	};

	getAutocompletions?(options: AutoCompleteOptions): Promise<unknown[]>;

	abstract addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void;

	protected abstract getUncached(inter: AutocompleteInteraction | SlashInteraction): unknown;

	private buildDescription(): string {
		let description = this.config?.description;
		const defaultValue = this.config?.defaultValue ?? this.defaultValue;

		if (this.defaultValue != undefined) {
			description += ` [default: ${defaultValue}]`;
		}
		if (description.length > 100) {
			throw new Error(`Error creating option ${this.identifier}. description length must be <= 100 (attempted: ${description.length})`);
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

	getRaw(inter: AutocompleteInteraction | SlashInteraction) {
		return inter.options.getString(this.id);
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
		return inter.options.getString(this.identifier);
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
		return inter.options.getBoolean(this.identifier);
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
		return inter.options.getInteger(this.identifier);
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
		return (inter as SlashInteraction).options.getChannel(this.identifier);
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
		return (inter as SlashInteraction).options.getRole(this.identifier);
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
		return (inter as SlashInteraction).options.getMentionable(this.identifier);
	}
}

export class UserOption extends BaseOption<SlashCommandUserOption> {
	static readonly ID = "user";
	id = UserOption.ID;

	addToCommand(command: SlashCommandBuilder | SlashCommandSubcommandBuilder): void {
		command.addUserOption(this.build);
	}

	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as User;
	}

	protected getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		return (inter as SlashInteraction).options.getUser(this.identifier);
	}
}