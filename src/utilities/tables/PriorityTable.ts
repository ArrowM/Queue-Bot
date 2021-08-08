import { GuildMember, Snowflake } from "discord.js";
import { Base } from "../Base";
import { PriorityEntry } from "../Interfaces";

export class PriorityTable {
   /**
    * Create & update QueueGuild database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.knex.schema.hasTable("priority").then(async (exists) => {
         if (!exists) {
            await Base.knex.schema
               .createTable("priority", (table) => {
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
      const entries = await Base.knex<PriorityEntry>("priority");
      for await (const entry of entries) {
         try {
            const guild = await Base.client.guilds.fetch(entry.guild_id);
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
      return Base.knex<PriorityEntry>("priority").where("guild_id", guildId).where("role_member_id", roleMemberId).first();
   }

   public static getMany(guildId: Snowflake) {
      return Base.knex<PriorityEntry>("priority").where("guild_id", guildId);
   }

   public static async isPriority(guildId: Snowflake, member: GuildMember) {
      const roleIds = member.roles.cache.keys();
      for (const id of [member.id, ...roleIds]) {
         const memberPerm = await Base.knex<PriorityEntry>("priority").where("guild_id", guildId).where("role_member_id", id).first();
         if (memberPerm) return true;
      }
      return false;
   }

   public static async store(guildId: Snowflake, roleMemberId: Snowflake, isRole: boolean): Promise<void> {
      await Base.knex<PriorityEntry>("priority").insert({
         guild_id: guildId,
         role_member_id: roleMemberId,
         is_role: isRole,
      });
   }

   public static async unstore(guildId: Snowflake, roleMemberId: Snowflake): Promise<void> {
      await Base.knex<PriorityEntry>("priority").where("guild_id", guildId).where("role_member_id", roleMemberId).first().delete();
   }
}
