import cronstrue from "cronstrue";
import { type Collection } from "discord.js";
import { lowerFirst } from "lodash-es";

import type { DbSchedule } from "../../db/schema.ts";
import type { UIOption } from "../../types/handler.types.ts";
import type { AutocompleteInteraction, SlashInteraction } from "../../types/interaction.types.ts";
import { ScheduleNotFoundError } from "../../utils/error.utils.ts";
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
		let schedule: DbSchedule | undefined;
		try {
			schedule = schedules.get(BigInt(idString));
		}
		catch {
			schedule = null;
		}
		if (schedule) {
			return schedule;
		}
		else {
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
			const humanReadableSchedule = lowerFirst(cronstrue.toString(schedule.cron));
			const timezone = schedule.timezone ? `(${schedule.timezone})` : "";
			const reason = schedule.reason ? ` - ${schedule.reason}` : "";
			suggestions.push({
				name: `${scope} will ${schedule.command} ${humanReadableSchedule} ${timezone}${reason}`.trimEnd(),
				value: schedule.id.toString(),
			});
		}
		return suggestions;
	}
}
