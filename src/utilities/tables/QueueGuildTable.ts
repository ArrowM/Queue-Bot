import { QueueGuild } from "../Interfaces";
import { Base } from "../Base";
import { Guild, Snowflake } from "discord.js";
import { QueueChannelTable } from "./QueueChannelTable";

export class QueueGuildTable {
   /**
    * Create & update QueueGuild database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("queue_guilds")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("queue_guilds", (table) => {
                     table.bigInteger("guild_id").primary();
                     table.integer("msg_mode");
                  })
                  .catch((e) => console.error(e));
            }
         });
   }

   /**
    * Cleanup deleted Guilds
    **/
   public static async validateEntries() {
      const entries = await Base.getKnex()<QueueGuild>("queue_guilds");
      for await (const entry of entries) {
         await 100;
         const guild = await Base.getClient()
            .guilds.fetch(entry.guild_id)
            .catch(() => null as Guild);
         if (guild) {
            await guild.channels.fetch().catch(() => null);
            await guild.members.fetch().catch(() => null);
            await guild.roles.fetch().catch(() => null);
            QueueChannelTable.validateEntries(guild);
         } else {
            this.unstore(entry.guild_id);
         }
      }
   }

   public static get(guildId: Snowflake) {
      return Base.getKnex()<QueueGuild>("queue_guilds").where("guild_id", guildId).first();
   }

   public static getAll() {
      return Base.getKnex()<QueueGuild>("queue_guilds");
   }

   public static async updateMessageMode(guildId: Snowflake, mode: number) {
      await this.get(guildId).update("msg_mode", mode);
   }

   public static async store(guild: Guild): Promise<void> {
      await Base.getKnex()<QueueGuild>("queue_guilds")
         .insert({ guild_id: guild.id, msg_mode: 1 })
         .catch(() => null);
   }

   public static async unstore(guildId: Snowflake): Promise<void> {
      await QueueChannelTable.unstore(guildId);
      await Base.getKnex()<QueueGuild>("queue_guilds").where("guild_id", guildId).delete();
   }
}
