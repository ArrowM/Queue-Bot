import { QueueUpdateRequest, Schedule, ScheduleCommand, StoredGuild, StoredQueue } from "./Interfaces";
import { Guild, GuildBasedChannel, Snowflake } from "discord.js";
import { ScheduleTable } from "./tables/ScheduleTable";
import { Base } from "./Base";
import { QueueTable } from "./tables/QueueTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";
import { schedule as cronSchedule, ScheduledTask } from "node-cron";
import { MessagingUtils } from "./MessagingUtils";
import { Commands } from "../Commands";
import MultikeyMap from "multikey-map";
import cronstrue from "cronstrue";

export class SchedulingUtils {
  // <queueChannelId, queueUpdateRequest>
  private static pendingQueueUpdates: Map<Snowflake, QueueUpdateRequest> = new Map();
  // <[queueChannelId, command], task>
  private static tasks = new MultikeyMap<[Snowflake, ScheduleCommand], ScheduledTask>();

  public static async scheduleDisplayUpdate(storedGuild: StoredGuild, queueChannel: GuildBasedChannel): Promise<void> {
    if (queueChannel) {
      this.pendingQueueUpdates.set(queueChannel.id, {
        storedGuild: storedGuild,
        queueChannel: queueChannel,
      });
    }
  }

  /**
   * Send scheduled display updates every second
   * Necessary to comply with Discord API rate limits
   */
  public static startScheduler() {
    // Edit displays
    setInterval(() => {
      if (this.pendingQueueUpdates) {
        for (const request of this.pendingQueueUpdates.values()) {
          MessagingUtils.updateDisplay(request)
            .then()
            .catch(() => null);
        }
        this.pendingQueueUpdates.clear();
      }
    }, 1000);
  }

  public static async stopScheduledCommand(queueChannelId: Snowflake, command?: ScheduleCommand) {
    const commands = command ? [command] : Object.values(ScheduleCommand);
    for (command of commands) {
      this.tasks.get([queueChannelId, command])?.stop();
    }
  }

  public static async scheduleCommand(
    queueChannelId: Snowflake,
    command: ScheduleCommand,
    schedule: string,
    utcOffset: number
  ) {
    try {
      const timezone = Base.getTimezone(utcOffset).timezone; // eslint-disable-next-line no-unused-vars
      let func = async () => {
        await SchedulingUtils.commandHelper(queueChannelId, command);
      };
      this.tasks.set([queueChannelId, command], cronSchedule(schedule, func, { timezone: timezone }));
    } catch (e: any) {
      console.error(e);
    }
  }

  private static async commandHelper(queueChannelId: Snowflake, command: ScheduleCommand) {
    let storedQueue: StoredQueue, storedGuild: StoredGuild, guild: Guild, queue: GuildBasedChannel;
    try {
      storedQueue = await QueueTable.get(queueChannelId);
      storedGuild = await QueueGuildTable.get(storedQueue.guild_id);
      guild = Base.client.guilds.cache.get(storedQueue.guild_id);
      queue = guild.channels.cache.get(storedQueue.queue_channel_id);
    } catch (ignore) {
      /** empty **/
    }
    if (!storedQueue || !storedGuild || !guild || !queue) {
      await this.stopScheduledCommand(queueChannelId, command);
      await ScheduleTable.unstore(queueChannelId, command);
    }
    switch (command) {
      case "clear":
        await QueueMemberTable.unstore(storedQueue.guild_id, storedQueue.queue_channel_id);
        await SchedulingUtils.scheduleDisplayUpdate(storedGuild, queue);
        break;
      case "display":
        await this.scheduleDisplayUpdate(storedGuild, queue);
        break;
      case "next":
        await Commands.pullHelper({ stored: storedQueue, channel: queue });
        break;
      case "shuffle":
        await Commands.shuffleHelper(undefined, { stored: storedQueue, channel: queue });
        break;
    }
  }

  public static async startCommandScheduler() {
    const promises = [];
    for await (const schedule of await ScheduleTable.getAll()) {
      promises.push(
        this.scheduleCommand(schedule.queue_channel_id, schedule.command, schedule.schedule, schedule.utc_offset)
      );
    }
    await Promise.all(promises);
  }

  public static async getSchedulesString(queueChannelId: Snowflake): Promise<string> {
    let str = "";
    const schedules = await Base.knex<Schedule>("schedules").where("queue_channel_id", queueChannelId);
    for (const schedule of schedules) {
      const timezone = Base.getTimezone(schedule.utc_offset).value;
      const command = schedule.command === "next" ? "pull" : schedule.command;
      str += `\nScheduled to \`${command}\` **${cronstrue.toString(schedule.schedule)}** ${timezone}.`;
    }
    return str;
  }
}
