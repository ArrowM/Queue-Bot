import { StoredGuild } from "../Interfaces";
import { Base } from "../Base";
import { Guild, Snowflake } from "discord.js";
import { QueueTable } from "./QueueTable";
import { AdminPermissionTable } from "./AdminPermissionTable";
import { PriorityTable } from "./PriorityTable";

export class QueueGuildTable {
  // Create & update database table if necessary
  public static async initTable() {
    await Base.knex.schema.hasTable("queue_guilds").then(async (exists) => {
      if (!exists) {
        await Base.knex.schema
          .createTable("queue_guilds", (table) => {
            table.bigInteger("guild_id").primary();
            table.boolean("disable_mentions");
            table.boolean("disable_notifications");
            table.boolean("disable_roles");
            table.boolean("enable_alt_prefix");
            table.integer("msg_mode");
            table.text("timestamps").defaultTo("off");
          })
          .catch((e) => console.error(e));
      }
    });
  }

  public static get(guildId: Snowflake) {
    return Base.knex<StoredGuild>("queue_guilds").where("guild_id", guildId).first();
  }

  public static async setDisableMentions(guildId: Snowflake, value: boolean) {
    await QueueGuildTable.get(guildId).update("disable_mentions", value);
  }

  public static async setDisableNotifications(guildId: Snowflake, value: boolean) {
    await QueueGuildTable.get(guildId).update("disable_notifications", value);
  }

  public static async setDisableRoles(guildId: Snowflake, value: boolean) {
    await QueueGuildTable.get(guildId).update("disable_roles", value);
  }

  public static async setMessageMode(guildId: Snowflake, mode: number) {
    await QueueGuildTable.get(guildId).update("msg_mode", mode);
  }

  public static async setAltPrefix(guildId: Snowflake, value: boolean) {
    await QueueGuildTable.get(guildId).update("enable_alt_prefix", value);
  }

  public static async setTimestamps(guildId: Snowflake, value: string) {
    await QueueGuildTable.get(guildId).update("timestamps", value);
  }

  public static async store(guild: Guild) {
    await Base.knex<StoredGuild>("queue_guilds").insert({ guild_id: guild.id, msg_mode: 1 });
  }

  public static async unstore(guildId: Snowflake) {
    await QueueTable.unstore(guildId);
    await AdminPermissionTable.unstore(guildId);
    await PriorityTable.unstore(guildId);
    await Base.knex<StoredGuild>("queue_guilds").where("guild_id", guildId).delete();
  }
}
