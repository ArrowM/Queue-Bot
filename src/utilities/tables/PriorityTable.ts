import delay from "delay";
import { Guild, GuildMember, Role, Snowflake } from "discord.js";
import { Base } from "../Base";
import { PriorityEntry } from "../Interfaces";

export class PriorityTable {
   /**
    * Create & update QueueGuild database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("priority")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("priority", (table) => {
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
    * Cleanup deleted Guilds, Roles, and Members
    **/
   public static async validateEntries() {
      const entries = await Base.getKnex()<PriorityEntry>("priority");
      for await (const entry of entries) {
         await delay(80);
         const guild = await Base.getClient()
            .guilds.fetch(entry.guild_id)
            .catch(() => null as Guild);
         if (guild) {
            const roleMember =
               (await guild.roles.fetch(entry.role_member_id).catch(() => null as Role)) ||
               (await guild.members.fetch(entry.role_member_id).catch(() => null as GuildMember));
            if (roleMember) continue;
         }
         await this.unstore(entry.guild_id, entry.role_member_id);
      }
   }

   public static get(guildId: Snowflake, roleMemberId: Snowflake) {
      return Base.getKnex()<PriorityEntry>("priority").where("guild_id", guildId).where("role_member_id", roleMemberId).first();
   }

   public static getMany(guildId: Snowflake) {
      return Base.getKnex()<PriorityEntry>("priority").where("guild_id", guildId);
   }

   public static async isPriority(guildId: Snowflake, member: GuildMember) {
      const roleIds = member.roles.cache.keyArray();
      for (const id of [member.id, ...roleIds]) {
         const memberPerm = await Base.getKnex()<PriorityEntry>("priority").where("guild_id", guildId).where("role_member_id", id).first();
         if (memberPerm) return true;
      }
      return false;
   }

   public static async store(guildId: Snowflake, roleMemberId: Snowflake, isRole: boolean): Promise<void> {
      await Base.getKnex()<PriorityEntry>("priority").insert({
         guild_id: guildId,
         role_member_id: roleMemberId,
         is_role: isRole,
      });
   }

   public static async unstore(guildId: Snowflake, roleMemberId: Snowflake): Promise<void> {
      await Base.getKnex()<PriorityEntry>("priority").where("guild_id", guildId).where("role_member_id", roleMemberId).first().delete();
   }
}
