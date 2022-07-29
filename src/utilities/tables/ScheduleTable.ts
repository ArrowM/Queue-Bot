import { Snowflake } from "discord.js";

import { Base } from "../Base";
import { Schedule, ScheduleCommand } from "../Interfaces";

export class ScheduleTable {
  // Create & update database table if necessary
  public static async initTable() {
    await Base.knex.schema.hasTable("schedules").then(async (exists) => {
      if (!exists) {
        await Base.knex.schema
          .createTable("schedules", (table) => {
            table.increments("id").primary();
            table.text("command");
            table.bigInteger("queue_channel_id");
            table.text("schedule");
            table.integer("utc_offset");
          })
          .catch((e) => console.error(e));
      }
    });
  }

  public static getAll() {
    return Base.knex<Schedule>("schedules");
  }

  public static get(queueChannelId: Snowflake, command: ScheduleCommand) {
    return Base.knex<Schedule>("schedules").where("queue_channel_id", queueChannelId).where("command", command).first();
  }

  public static getFromQueue(queueChannelId: Snowflake) {
    return Base.knex<Schedule>("schedules").where("queue_channel_id", queueChannelId);
  }

  public static async store(queueChannelId: Snowflake, command: ScheduleCommand, schedule: string, utcOffset: number): Promise<void> {
    const existingEntry = await Base.knex<Schedule>("schedules").where("queue_channel_id", queueChannelId).where("command", command);
    if (existingEntry.length) {
      await Base.knex<Schedule>("schedules")
        .where("queue_channel_id", queueChannelId)
        .where("command", command)
        .update({ schedule: schedule, utc_offset: utcOffset });
    } else {
      await Base.knex<Schedule>("schedules").insert({
        queue_channel_id: queueChannelId,
        command: command,
        schedule: schedule,
        utc_offset: utcOffset,
      });
    }
  }

  public static async unstore(queueChannelId: Snowflake, command?: ScheduleCommand) {
    let query = Base.knex<Schedule>("schedules").delete();
    if (queueChannelId) {
      query = query.where("queue_channel_id", queueChannelId);
    }
    if (command) {
      query = query.where("command", command);
    }
    await query;
  }
}
