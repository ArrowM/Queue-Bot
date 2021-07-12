import { AdminPermission } from "../Interfaces";
import { Base } from "../Base";
import { Guild, GuildMember, Role, Snowflake } from "discord.js";
import delay from "delay";

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
         await delay(1000);
         console.log("fetching Guild: " + entry.guild_id);
         const guild = await Base.getClient()
            .guilds.fetch(entry.guild_id)
            .catch(() => null as Guild);
         if (guild) {
            console.log("fetching Role/Member: " + entry.role_member_id);
            const roleMember =
               (await guild.roles.fetch(entry.role_member_id).catch(() => null as Role)) ||
               (await guild.members.fetch(entry.role_member_id).catch(() => null as GuildMember));
            if (roleMember) continue;
         }
         await this.unstore(entry.guild_id, entry.role_member_id);
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
