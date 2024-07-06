import cronstrue from "cronstrue";
import { channelMention, type Collection, EmbedBuilder, inlineCode, SlashCommandBuilder } from "discord.js";
import { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { findKey, isNil, omitBy } from "lodash-es";

import { type DbQueue, SCHEDULE_TABLE } from "../../db/schema.ts";
import { CommandOption } from "../../options/options/command.option.ts";
import { CronOption } from "../../options/options/cron.option.ts";
import { CustomCronOption } from "../../options/options/custom-cron.option.ts";
import { MessageChannelOption } from "../../options/options/message-channel.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { ReasonOption } from "../../options/options/reason.option.ts";
import { SchedulesOption } from "../../options/options/schedules.option.ts";
import { TimezoneOption } from "../../options/options/timezone.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import { Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { SelectMenuTransactor } from "../../utils/message-utils/select-menu-transactor.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { ScheduleUtils } from "../../utils/schedule.utils.ts";
import { describeTable, queuesMention, scheduleMention } from "../../utils/string.utils.ts";

export class ScheduleCommand extends AdminCommand {
	static readonly ID = "schedule";

	schedule_get = ScheduleCommand.schedule_get;
	schedule_add = ScheduleCommand.schedule_add;
	schedule_set = ScheduleCommand.schedule_set;
	schedule_reset = ScheduleCommand.schedule_reset;
	schedule_delete = ScheduleCommand.schedule_delete;
	schedule_help = ScheduleCommand.schedule_help;

	data = new SlashCommandBuilder()
		.setName(ScheduleCommand.ID)
		.setDescription("Manage scheduled commands")
		.addSubcommand(subcommand => {
			subcommand
				.setName("get")
				.setDescription("Get scheduled commands");
			Object.values(ScheduleCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("add")
				.setDescription("Create a scheduled command");
			Object.values(ScheduleCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("set")
				.setDescription("Update a scheduled command");
			Object.values(ScheduleCommand.SET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("reset")
				.setDescription("Reset a scheduled command");
			Object.values(ScheduleCommand.RESET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("delete")
				.setDescription("Delete a scheduled command");
			Object.values(ScheduleCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand(subcommand => {
			subcommand
				.setName("help")
				.setDescription("Info about creating schedules");
			return subcommand;
		});

	// ====================================================================
	//                           /schedule get
	// ====================================================================

	static readonly GET_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Get schedules of specific queue(s)" }),
	};

	static async schedule_get(inter: SlashInteraction, queues?: Collection<bigint, DbQueue>) {
		queues = queues ?? await ScheduleCommand.GET_OPTIONS.queues.get(inter);

		const schedules = inter.store.dbSchedules().filter(schedule => queues.has(schedule.queueId));

		const descriptionMessage = describeTable({
			store: inter.store,
			table: SCHEDULE_TABLE,
			tableLabel: "Scheduled commands",
			entryLabelProperty: "command",
			entries: [...schedules.values()],
			valueFormatters: {
				cron: (cron) => `${inlineCode(cron)} (${cronstrue.toString(cron)})`,
				messageChannelId: id => channelMention(id),
			},
		});

		await inter.respond(descriptionMessage);
	}

	// ====================================================================
	//                           /schedule add
	// ====================================================================

	static readonly ADD_OPTIONS = {
		queues: new QueuesOption({ required: true, description: "Queue(s) to create scheduled command for" }),
		command: new CommandOption({ required: true, description: "Command to schedule" }),
		cron: new CronOption({ required: true, description: "Cron schedule" }),
		customCron: new CustomCronOption({ description: "Custom cron schedule" }),
		timezone: new TimezoneOption({ description: "Timezone for the schedule" }),
		messageChannel: new MessageChannelOption({ description: "Channel to send command messages" }),
		reason: new ReasonOption({ description: "Reason for the schedule" }),
	};

	static async schedule_add(inter: SlashInteraction) {
		const queues = await ScheduleCommand.ADD_OPTIONS.queues.get(inter);
		const schedule = {
			guildId: inter.guildId,
			command: ScheduleCommand.ADD_OPTIONS.command.get(inter),
			cron: ScheduleCommand.ADD_OPTIONS.cron.get(inter),
			...omitBy({
				timezone: await ScheduleCommand.ADD_OPTIONS.timezone.get(inter),
				messageChannelId: ScheduleCommand.ADD_OPTIONS.messageChannel.get(inter)?.id,
				reason: ScheduleCommand.ADD_OPTIONS.reason.get(inter),
			}, isNil),
		};

		if (schedule.cron === "custom") {
			schedule.cron = ScheduleCommand.ADD_OPTIONS.customCron.get(inter);
		}

		const {
			insertedSchedules,
			updatedQueueIds,
		} = ScheduleUtils.insertSchedules(inter.store, queues, schedule);

		const schedulesStr = insertedSchedules.map(schedule => `- ${scheduleMention(schedule)}`).join("\n");
		await inter.respond(`Created schedule${insertedSchedules.length > 1 ? "s" : ""}.\n${schedulesStr}`, true);

		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));
		await this.schedule_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /schedule set
	// ====================================================================

	static readonly SET_OPTIONS = {
		schedules: new SchedulesOption({ required: true, description: "Scheduled commands to update" }),
		command: new CommandOption({ description: "Command to schedule" }),
		cron: new CronOption({ description: "Cron schedule" }),
		customCron: new CustomCronOption({ description: "Custom cron schedule" }),
		timezone: new TimezoneOption({ description: "Timezone for the schedule" }),
		messageChannel: new MessageChannelOption({ description: "Channel to send command messages" }),
		reason: new ReasonOption({ description: "Reason for the schedule" }),
	};

	static async schedule_set(inter: SlashInteraction) {
		const schedules = await ScheduleCommand.SET_OPTIONS.schedules.get(inter);
		const scheduleUpdate = omitBy({
			command: ScheduleCommand.SET_OPTIONS.command.get(inter),
			cron: ScheduleCommand.SET_OPTIONS.cron.get(inter),
			timezone: await ScheduleCommand.SET_OPTIONS.timezone.get(inter),
			messageChannelId: ScheduleCommand.SET_OPTIONS.messageChannel.get(inter)?.id,
			reason: ScheduleCommand.SET_OPTIONS.reason.get(inter),
		}, isNil);

		if (scheduleUpdate.cron === "custom") {
			scheduleUpdate.cron = ScheduleCommand.ADD_OPTIONS.customCron.get(inter);
		}

		const {
			updatedSchedules,
			updatedQueueIds,
		} = ScheduleUtils.updateSchedules(inter.store, schedules, scheduleUpdate);

		const schedulesStr = updatedSchedules.map(schedule => `- ${scheduleMention(schedule)}`).join("\n");
		await inter.respond(`Created schedule${updatedSchedules.length > 1 ? "s" : ""}.\n${schedulesStr}`, true);

		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));
		await this.schedule_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /schedule reset
	// ====================================================================

	static readonly RESET_OPTIONS = {
		schedules: new SchedulesOption({ required: true, description: "Scheduled commands to reset" }),
	};

	static async schedule_reset(inter: SlashInteraction) {
		const schedules = await ScheduleCommand.RESET_OPTIONS.schedules.get(inter);

		const selectMenuOptions = [
			{ name: TimezoneOption.ID, value: SCHEDULE_TABLE.timezone.name },
			{ name: MessageChannelOption.ID, value: SCHEDULE_TABLE.messageChannelId.name },
			{ name: ReasonOption.ID, value: SCHEDULE_TABLE.reason.name },
		];

		const selectMenuTransactor = new SelectMenuTransactor(inter);
		const propertiesToReset = await selectMenuTransactor.sendAndReceive("Schedule properties to reset", selectMenuOptions) ?? [];

		const updatedProperties = {} as any;
		for (const property of propertiesToReset) {
			const columnKey = findKey(SCHEDULE_TABLE, (column: SQLiteColumn) => column.name === property);
			updatedProperties[columnKey] = (SCHEDULE_TABLE as any)[columnKey]?.default ?? null;
		}

		const {
			updatedSchedules,
			updatedQueueIds,
		} = ScheduleUtils.updateSchedules(inter.store, schedules, updatedProperties);

		const schedulesStr = updatedSchedules.map(schedule => `- ${scheduleMention(schedule)}`).join("\n");
		await inter.respond(`Reset schedule${updatedSchedules.length > 1 ? "s" : ""}.\n${schedulesStr}`, true);

		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));
		await this.schedule_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /schedule delete
	// ====================================================================

	static readonly DELETE_OPTIONS = {
		schedules: new SchedulesOption({ required: true, description: "Scheduled commands to delete" }),
	};

	static async schedule_delete(inter: SlashInteraction) {
		const schedules = await ScheduleCommand.DELETE_OPTIONS.schedules.get(inter);

		const {
			deletedSchedules,
			updatedQueueIds,
		} = ScheduleUtils.deleteSchedules(inter.guildId, schedules.map(sch => sch.id), inter.store);
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		const schedulesStr = deletedSchedules.map(schedule => `- ${scheduleMention(schedule)}`).join("\n");
		await inter.respond(`Deleted schedule${schedules.size ? "s" : ""}:\n${schedulesStr} of ${queuesMention(updatedQueues)} queue${updatedQueues.length > 1 ? "s" : ""}.`, true);

		await this.schedule_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /schedule help
	// ====================================================================

	static async schedule_help(inter: SlashInteraction) {
		const embeds = [new EmbedBuilder()
			.setTitle("Scheduled Commands")
			.setColor(Color.Indigo)
			.setDescription(
				"Some commands can be ran on a schedule using the cron schedule format. " +
				"https://crontab.guru/examples.html has common schedules. " +
				"ChatGPT can probably also help you with a schedule. " +
				"The highest frequency schedule you can set is once a minute."
			)];

		await inter.respond({ embeds });
	}
}
