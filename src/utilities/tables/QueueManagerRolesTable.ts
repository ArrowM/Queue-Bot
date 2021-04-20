import { QueueManagerRole } from "../Interfaces";
import { Base } from "../Base";
import { Guild } from "discord.js";

export class QueueManagerRolesTable {
   /**
    * Create & update QueueManagerRoles database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("queue_manager_roles")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("queue_manager_roles", (table) => {
                     table.text("guild_id").primary();
                     table.text("role_name");
                  })
                  .catch((e) => console.error(e));
            }
         });
      await this.updateTableStructure();
   }

   /**
    * @param guildId
    */
   public static getAll(guildId: string) : Promise<QueueManagerRole[]> {
      return Base.getKnex()<QueueManagerRole>("queue_manager_roles").where("guild_id", guildId)
                                                                    .catch(() => null);
   }

   /**
    * @param guild
    * @param role
    */
   public static async storeQueueManagerRole(guild: Guild, role: string): Promise<void> {
      await Base.getKnex()<QueueManagerRole>("queue_manager_roles")
         .insert({
            guild_id: guild.id,
            role_name: role
         })
         .catch(() => null);
   }

   /**
    * @param guild
    */
   public static async unstoreQueueManagerRole(guildId: string, roleId: string): Promise<void> {
      await Base.getKnex()<QueueManagerRole>("queue_manager_roles").where("guild_id", guildId).where("role_name", roleId).del();
   }

   /**
    * Modify the database structure for code patches
    */
   protected static async updateTableStructure(): Promise<void> { }
}
