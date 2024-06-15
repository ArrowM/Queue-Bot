import type { Collection } from "discord.js";
import { uniq } from "lodash-es";
import { schedule as cron, type ScheduledTask, validate } from "node-cron";

import { QueryUtils } from "../db/queries.ts";
import { type DbQueue, type DbSchedule, type NewSchedule } from "../db/schema.ts";
import { Store } from "../db/store.ts";
import { ArchivedMemberReason, DisplayUpdateType, ScheduleCommand } from "../types/db.types.ts";
import { type ArrayOrCollection, TIMEZONES } from "../types/misc.types.ts";
import { ClientUtils } from "./client.utils.ts";
import { DisplayUtils } from "./display.utils.ts";
import { InvalidCronError } from "./error.utils.ts";
import { MemberUtils } from "./member.utils.ts";
import { map } from "./misc.utils.ts";

export namespace ScheduleUtils {
	export function insertSchedules(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, schedule: Omit<NewSchedule, "queueId">) {
		// validate
		validateCron(schedule.cron);
		validateTimezone(schedule.timezone);

		// insert into db and start cron task
		const insertedSchedules = map(queues, (queue) => {
			const insertedSchedule = store.insertSchedule({ queueId: queue.id, ...schedule });
			registerWithCronLibrary(insertedSchedule);
			return insertedSchedule;
		});
		const updatedQueueIds = uniq(insertedSchedules.map(schedule => schedule.queueId));

		DisplayUtils.requestDisplaysUpdate(store, updatedQueueIds);

		return { insertedSchedules, updatedQueueIds };
	}

	export function updateSchedules(store: Store, schedules: Collection<bigint, DbSchedule>, update: Partial<DbSchedule>) {
		// validate
		if (update.cron) validateCron(update.cron);
		if (update.timezone) validateTimezone(update.timezone);

		// update db and cron task
		const updatedSchedules = schedules.map((schedule) => {
			const updatedSchedule = store.updateSchedule({ id: schedule.id, ...update });
			const task = scheduleIdToScheduleTask.get(updatedSchedule.id);
			if (task) {
				task.stop();
				registerWithCronLibrary(updatedSchedule);
			}
			return updatedSchedule;
		});
		const updatedQueueIds = uniq(updatedSchedules.map(schedule => schedule.queueId));

		DisplayUtils.requestDisplaysUpdate(store, updatedQueueIds);

		return { updatedSchedules, updatedQueueIds };
	}

	export function deleteSchedules(scheduleIds: bigint[], store?: Store) {
		function deleteFn(id: bigint) {
			if (store) {
				return store.deleteSchedule({ id });
			}
			else {
				return QueryUtils.deleteSchedule({ guildId: store.guild.id, id });
			}
		}

		// delete from db and stop cron task
		const deletedSchedules = scheduleIds.map((id) => {
			const deletedSchedule = deleteFn(id);
			const task = scheduleIdToScheduleTask.get(deletedSchedule.id);
			if (task) {
				task.stop();
				scheduleIdToScheduleTask.delete(deletedSchedule.id);
			}
			return deletedSchedule;
		});
		const updatedQueueIds = uniq(deletedSchedules.map(schedule => schedule.queueId));

		DisplayUtils.requestDisplaysUpdate(store, updatedQueueIds);

		return { deletedSchedules, updatedQueueIds };
	}

	// ====================================================================
	//                           Schedule runner
	// ====================================================================

	const scheduleIdToScheduleTask = new Map<bigint, ScheduledTask>();

	export function validateCron(cron: string) {
		if (!validate(cron) || cron.split(" ").length !== 5) {
			throw new InvalidCronError();
		}
	}

	export function validateTimezone(timezone: string) {
		if (!TIMEZONES.includes(timezone)) {
			throw new Error("Invalid timezone");
		}
	}

	export function loadSchedules() {
		const dbSchedules = QueryUtils.selectAllSchedules();
		console.time(`Loaded ${dbSchedules.length} schedules`);
		dbSchedules.forEach(sch => registerWithCronLibrary(sch));
		console.timeEnd(`Loaded ${dbSchedules.length} schedules`);
	}


	function registerWithCronLibrary(schedule: DbSchedule) {
		scheduleIdToScheduleTask.set(
			schedule.id,
			cron(schedule.cron, async () => {
				try {
					await executeScheduledCommand(schedule.id);
				}
				catch (e) {
					const { message, stack } = e as Error;
					console.error("Failed to execute scheduled command:");
					console.error(`Error: ${message}`);
					console.error(`Stack Trace: ${stack}`);
				}
			}, { timezone: schedule.timezone }),
		);
	}

	async function executeScheduledCommand(scheduleId: bigint) {
		const { store, queue, schedule } = await getScheduleContext(scheduleId);

		switch (schedule.command) {
			case ScheduleCommand.Clear:
				await MemberUtils.clearMembers(store, queue, schedule.messageChannelId);
				break;
			case ScheduleCommand.Pull:
				await MemberUtils.deleteMembers({
					store,
					queues: [queue],
					reason: ArchivedMemberReason.Pulled,
				});
				break;
			case ScheduleCommand.Show:
				DisplayUtils.requestDisplayUpdate(store, queue.id, { updateTypeOverride: DisplayUpdateType.Replace });
				break;
			case ScheduleCommand.Shuffle:
				await MemberUtils.shuffleMembers(store, queue, schedule.messageChannelId);
		}
	}

	async function getScheduleContext(scheduleId: bigint) {
		let store, queue, schedule;

		try {
			schedule = QueryUtils.selectSchedule({ id: scheduleId });
		}
		catch (e) {
			deleteSchedules([schedule.id]);
			throw e;
		}

		try {
			const guild = await ClientUtils.getGuild(schedule.guildId);
			store = new Store(guild);
		}
		catch (e) {
			QueryUtils.deleteGuild({ guildId: schedule.guildId });
			throw e;
		}

		try {
			queue = QueryUtils.selectQueue({ guildId: schedule.guildId, id: schedule.queueId });
		}
		catch (e) {
			store.deleteQueue({ id: queue.id });
			throw e;
		}

		return { store, queue, schedule };
	}
}
