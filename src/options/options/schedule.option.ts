import type { Collection } from "discord.js";

import type { DbSchedule } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { ScheduleNotFoundError } from "../../utils/error.utils.ts";
import { scheduleMention } from "../../utils/string.utils.ts";
import { type AutoCompleteOptions, CustomOption } from "../base-option.ts";

export class ScheduleOption extends CustomOption {
	static readonly ID = "schedule";
	id = ScheduleOption.ID;

	getAutocompletions = ScheduleOption.getAutocompletions;

	// force return type to be DbSchedule
	get(inter: AutocompleteInteraction | SlashInteraction) {
		return super.get(inter) as Promise<DbSchedule>;
	}

	protected async getUncached(inter: AutocompleteInteraction | SlashInteraction) {
		const inputString = inter.options.getString(ScheduleOption.ID);
		if (!inputString) return;

		const queues = await inter.parser.getScopedQueues();
		const schedules = inter.parser.getScopedSchedules(queues);

		return ScheduleOption.findSchedule(schedules, inputString);
	}

	static findSchedule(schedules: Collection<bigint, DbSchedule>, idString: string): DbSchedule {
		try {
			const schedule = schedules.get(BigInt(idString));
			if (schedule) {
				return schedule;
			}
			else {
				throw new ScheduleNotFoundError();
			}
		}
		catch {
			throw new ScheduleNotFoundError();
		}
	}

	static async getAutocompletions(options: AutoCompleteOptions): Promise<UIOption[]> {
		const { inter } = options;
		const queues = await inter.parser.getScopedQueues();
		const schedules = inter.parser.getScopedSchedules(queues);

		const suggestions: UIOption[] = [];
		for (const schedule of schedules.values()) {
			const scope = schedule.queueId ? `'${queues.get(schedule.queueId).name}' queue` : "All queues";
			suggestions.push({
				name: `${scope} ${scheduleMention(schedule)}`,
				value: schedule.id.toString(),
			});
		}
		return suggestions;
	}
}
