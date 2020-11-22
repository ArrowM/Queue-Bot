import { QueueGuild } from "../Interfaces";
import { Base } from "../Base";

export class QueueGuildTable {
   /**
    * Create & update QueueGuild database table if necessary
    */
   public static initTable(): void {
      Base.getKnex()
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
                  })
                  .catch((e) => console.error(e));
            }
         });

      this.updateTableStructure();
   }

   /**
    * Modify the database structure for code patches
    */
   protected static updateTableStructure(): void {
      this.addMsgMode();
   }
   /**
    * Migration of msg_on_update to msg_mode
    */
   private static async addMsgMode(): Promise<void> {
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
   }
}
