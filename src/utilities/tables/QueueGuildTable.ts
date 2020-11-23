import { QueueGuild } from "../Interfaces";
import { Base } from "../Base";

export class QueueGuildTable extends Base {
   /**
    * Create & update QueueGuild database table if necessary
    */
   public static initTable(): void {
      this.knex.schema.hasTable("queue_guilds").then(async (exists) => {
         if (!exists) {
            await this.knex.schema
               .createTable("queue_guilds", (table) => {
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
      if (await this.knex.schema.hasColumn("queue_guilds", "msg_on_update")) {
         console.log("Migrating message mode");
         await this.knex.schema.table("queue_guilds", (table) => table.integer("msg_mode"));
         (await this.knex<QueueGuild>("queue_guilds")).forEach(async (queueGuild) => {
            await this.knex<QueueGuild>("queue_guilds")
               .where("guild_id", queueGuild.guild_id)
               .update("msg_mode", queueGuild["msg_on_update"] ? 2 : 1);
         });
         await this.knex.schema.table("queue_guilds", (table) => table.dropColumn("msg_on_update"));
      }
   }
}
