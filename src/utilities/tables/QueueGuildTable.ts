import { QueueGuild } from "../Interfaces";
import { Base } from "../Base";
import { Guild } from "discord.js";
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
                     table.text("guild_id").primary();
                     table.text("grace_period");
                     table.text("prefix");
                     table.text("color");
                     table.integer("msg_mode");
                     table.text("cleanup_commands");
                  })
                  .catch((e) => console.error(e));
            }
         });

      await this.updateTableStructure();
   }

   /**
    *
    * @param guild
    */
   public static async storeQueueGuild(guild: Guild): Promise<QueueGuild> {
      await Base.getKnex()<QueueGuild>("queue_guilds")
         .insert({
            color: "#51ff7e",
            grace_period: "0",
            guild_id: guild.id,
            msg_mode: 1,
            prefix: Base.getConfig().prefix,
         })
         .catch(() => null);
      guild.me.setNickname(`(${Base.getConfig().prefix}) Queue Bot`).catch(() => null);
      return await Base.getKnex()<QueueGuild>("queue_guilds").where("guild_id", guild.id).first();
   }

   /**
    *
    * @param guild
    */
   public static async unstoreQueueGuild(guildId: string): Promise<void> {
      await QueueChannelTable.unstoreQueueChannel(guildId);
      await Base.getKnex()<QueueGuild>("queue_guilds").where("guild_id", guildId).del();
   }

   /**
    * Modify the database structure for code patches
    */
   protected static async updateTableStructure(): Promise<void> {
      // Migration of msg_on_update to msg_mode
      if (await Base.getKnex().schema.hasColumn("queue_guilds", "msg_on_update")) {
         console.log("Migrating message mode");
         await Base.getKnex().schema.table("queue_guilds", (table) => table.integer("msg_mode"));
         (await Base.getKnex()<QueueGuild>("queue_guilds")).forEach(async (queueGuild) => {
            await Base.getKnex()<QueueGuild>("queue_guilds")
               .where("guild_id", queueGuild.guild_id)
               .update("msg_mode", queueGuild["msg_on_update"] ? 2 : 1);
         });
         await Base.getKnex().schema.table("queue_guilds", (table) => table.dropColumn("msg_on_update"));
      }
      // Add cleanup_commands
      if (!(await Base.getKnex().schema.hasColumn("queue_guilds", "cleanup_commands"))) {
         await Base.getKnex().schema.table("queue_guilds", (table) => table.text("cleanup_commands"));
         await Base.getKnex()<QueueGuild>("queue_guilds").update("cleanup_commands", "off");
      }
   }
}
