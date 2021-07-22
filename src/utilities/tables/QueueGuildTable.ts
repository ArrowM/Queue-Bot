import { QueueGuild } from "../Interfaces";
import { Base } from "../Base";
import { Guild, Snowflake } from "discord.js";
import { QueueChannelTable } from "./QueueChannelTable";
import delay from "delay";

export class QueueGuildTable {
   /**
    * Create & update QueueGuild database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.knex.schema.hasTable("queue_guilds").then(async (exists) => {
         if (!exists) {
            await Base.knex.schema
               .createTable("queue_guilds", (table) => {
                  table.bigInteger("guild_id").primary();
                  table.boolean("disable_mentions");
                  table.integer("msg_mode");
                  table.boolean("enable_alt_prefix");
               })
               .catch((e) => console.error(e));
         }
      });
   }

   /**
    * Cleanup deleted Guilds
    **/
   public static async validateEntries() {
      const entries = await Base.knex<QueueGuild>("queue_guilds");
      for await (const entry of entries) {
         try {
            await delay(1000);
            const guild = await Base.client.guilds.fetch(entry.guild_id);
            if (guild) {
               await guild.channels.fetch().catch(() => null);
               await guild.members.fetch().catch(() => null);
               await guild.roles.fetch().catch(() => null);
               QueueChannelTable.validateEntries(guild);
            } else {
               this.unstore(entry.guild_id);
            }
         } catch (e) {
            // SKIP
         }
      }
   }

   public static get(guildId: Snowflake) {
      return Base.knex<QueueGuild>("queue_guilds").where("guild_id", guildId).first();
   }

   public static getAll() {
      return Base.knex<QueueGuild>("queue_guilds");
   }

   public static async updateDisableMentions(guildId: Snowflake, value: boolean): Promise<void> {
      await this.get(guildId).update("disable_mentions", value);
   }

   public static async updateMessageMode(guildId: Snowflake, mode: number): Promise<void> {
      await this.get(guildId).update("msg_mode", mode);
   }

   public static async updateAltPrefix(guildId: Snowflake, value: boolean): Promise<void> {
      await this.get(guildId).update("enable_alt_prefix", value);
   }

   public static async store(guild: Guild): Promise<void> {
      await Base.knex<QueueGuild>("queue_guilds").insert({ guild_id: guild.id, msg_mode: 1 });
   }

   public static async unstore(guildId: Snowflake): Promise<void> {
      await QueueChannelTable.unstore(guildId);
      await Base.knex<QueueGuild>("queue_guilds").where("guild_id", guildId).delete();
   }
}
