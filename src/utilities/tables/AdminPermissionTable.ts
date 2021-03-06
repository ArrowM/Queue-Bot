import { AdminPermission } from "../Interfaces";
import { Base } from "../Base";
import { Snowflake } from "discord.js";

export class AdminPermissionTable {
   /**
    * Create & update AdminPermission database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("admin_permission")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("admin_permission", (table) => {
                     table.increments("id").primary();
                     table.bigInteger("guild_id");
                     table.bigInteger("role_member_id");
                     table.boolean("is_role");
                  })
                  .catch((e) => console.error(e));
            }
         });
   }

   /**
    * Cleanup deleted Guilds, Roles, or Members
    **/
   public static async validateEntries() {
      const entries = await Base.getKnex()<AdminPermission>("admin_permission");
      for await (const entry of entries) {
         try {
            const guild = await Base.getClient().guilds.fetch(entry.guild_id);
            if (guild) {
               const roleMember = (await guild.roles.fetch(entry.role_member_id)) || (await guild.members.fetch(entry.role_member_id));
               if (roleMember) continue;
            }
            await this.unstore(entry.guild_id, entry.role_member_id);
         } catch (e) {
            // SKIP
         }
      }
   }

   public static get(guildId: Snowflake, roleMemberId: Snowflake) {
      return Base.getKnex()<AdminPermission>("admin_permission").where("guild_id", guildId).where("role_member_id", roleMemberId).first();
   }

   public static getMany(guildId: Snowflake) {
      return Base.getKnex()<AdminPermission>("admin_permission").where("guild_id", guildId);
   }

   public static async store(guildId: Snowflake, roleMemberId: Snowflake, isRole: boolean): Promise<void> {
      await Base.getKnex()<AdminPermission>("admin_permission")
         .insert({
            guild_id: guildId,
            role_member_id: roleMemberId,
            is_role: isRole,
         })
         .catch(() => null);
   }

   public static async unstore(guildId: Snowflake, roleMemberId: Snowflake): Promise<void> {
      await Base.getKnex()<AdminPermission>("admin_permission").where("guild_id", guildId).where("role_member_id", roleMemberId).delete();
   }
}
