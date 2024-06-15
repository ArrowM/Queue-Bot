import cronstrue from "cronstrue";
import { type Collection, EmbedBuilder, inlineCode, SlashCommandBuilder } from "discord.js";
import { isNil, omitBy } from "lodash-es";

import { type DbQueue, type DbSchedule, SCHEDULE_TABLE } from "../../db/schema.ts";
import { CommandOption } from "../../options/options/command.option.ts";
import { CronOption } from "../../options/options/cron.option.ts";
import { MessageChannelOption } from "../../options/options/message-channel.option.ts";
import { QueuesOption } from "../../options/options/queues.option.ts";
import { ReasonOption } from "../../options/options/reason.option.ts";
import { SchedulesOption } from "../../options/options/schedules.option.ts";
import { TimezoneOption } from "../../options/options/timezone.option.ts";
import { AdminCommand } from "../../types/command.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { toCollection } from "../../utils/misc.utils.ts";
import { ScheduleUtils } from "../../utils/schedule.utils.ts";
import { describeTable, queuesMention } from "../../utils/string.utils.ts";

export class ScheduleCommand extends AdminCommand {
	static readonly ID = "schedules";

	schedule_get = ScheduleCommand.schedule_get;
	schedule_add = ScheduleCommand.schedule_add;
	schedule_set = ScheduleCommand.schedule_set;
	schedule_delete = ScheduleCommand.schedule_delete;
	schedule_help = ScheduleCommand.schedule_help;

	data = new SlashCommandBuilder()
		.setName(ScheduleCommand.ID)
		.setDescription("Manage scheduled commands")
		.addSubcommand((subcommand) => {
			subcommand
				.setName("get")
				.setDescription("Get scheduled commands");
			Object.values(ScheduleCommand.GET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand((subcommand) => {
			subcommand
				.setName("add")
				.setDescription("Create a scheduled command");
			Object.values(ScheduleCommand.ADD_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand((subcommand) => {
			subcommand
				.setName("set")
				.setDescription("Update a scheduled command");
			Object.values(ScheduleCommand.SET_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand((subcommand) => {
			subcommand
				.setName("delete")
				.setDescription("Delete a scheduled command");
			Object.values(ScheduleCommand.DELETE_OPTIONS).forEach(option => option.addToCommand(subcommand));
			return subcommand;
		})
		.addSubcommand((subcommand) => {
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
			propertyFormatters: {
				cron: (cron) => `${inlineCode(cron)} (${cronstrue.toString(cron)})`,
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
		timezone: new TimezoneOption({ required: true, description: "Timezone for the schedule" }),
		messageChannel: new MessageChannelOption({ description: "Channel to send command messages" }),
		reason: new ReasonOption({ description: "Reason for the schedule" }),
	};

	static async schedule_add(inter: SlashInteraction) {
		const queues = await ScheduleCommand.ADD_OPTIONS.queues.get(inter);
		const schedule = {
			guildId: inter.guildId,
			command: ScheduleCommand.ADD_OPTIONS.command.get(inter),
			cron: ScheduleCommand.ADD_OPTIONS.cron.get(inter),
			timezone: await ScheduleCommand.ADD_OPTIONS.timezone.get(inter),
			messageChannelId: ScheduleCommand.ADD_OPTIONS.messageChannel.get(inter)?.id,
			reason: ScheduleCommand.ADD_OPTIONS.reason.get(inter),
		};

		const {
			updatedQueueIds,
		} = ScheduleUtils.insertSchedules(inter.store, queues, schedule);
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		await inter.respond(`Scheduled ${schedule.command} for the '${queuesMention(updatedQueues)}' queue${updatedQueues.length > 1 ? "s" : ""}.`, true);
		await this.schedule_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /schedule set
	// ====================================================================

	static readonly SET_OPTIONS = {
		schedules: new SchedulesOption({ required: true, description: "Scheduled commands to update" }),
		command: new CommandOption({ description: "Command to schedule" }),
		cron: new CronOption({ description: "Cron schedule" }),
		timezone: new TimezoneOption({ description: "Timezone for the schedule" }),
		messageChannelId: new MessageChannelOption({ description: "Channel to send command messages" }),
		reason: new ReasonOption({ description: "Reason for the schedule" }),
	};

	static async schedule_set(inter: SlashInteraction) {
		const schedules = await ScheduleCommand.SET_OPTIONS.schedules.get(inter);
		const scheduleUpdate = omitBy({
			command: ScheduleCommand.SET_OPTIONS.command.get(inter),
			cron: ScheduleCommand.SET_OPTIONS.cron.get(inter),
			timezone: ScheduleCommand.SET_OPTIONS.timezone.get(inter),
			messageChannelId: ScheduleCommand.SET_OPTIONS.messageChannelId.get(inter),
			reason: ScheduleCommand.SET_OPTIONS.reason.get(inter),
		}, isNil) as Partial<DbSchedule>;

		const {
			updatedQueueIds,
		} = ScheduleUtils.updateSchedules(inter.store, schedules, scheduleUpdate);
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		await inter.respond(`Updated ${schedules.size} schedule${schedules.size ? "s" : ""}.`, true);
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
			updatedQueueIds,
		} = ScheduleUtils.deleteSchedules(schedules.map(sch => sch.id), inter.store);
		const updatedQueues = updatedQueueIds.map(queueId => inter.store.dbQueues().get(queueId));

		await inter.respond(`Deleted ${schedules.size} schedule${schedules.size ? "s" : ""}.`, true);
		await this.schedule_get(inter, toCollection<bigint, DbQueue>("id", updatedQueues));
	}

	// ====================================================================
	//                           /schedule help
	// ====================================================================

	static async schedule_help(inter: SlashInteraction) {
		const embeds = [new EmbedBuilder()
			.setTitle("Scheduled Commands")
			.setDescription(
				"Some commands can be ran on a schedule using the cron schedule format. " +
				"https://crontab.guru/examples.html has common schedules. " +
				"ChatGPT can probably also help you with a schedule. " +
				"The highest frequency schedule you can set is once a minute.",
			)];

		await inter.respond({ embeds });
	}
}
