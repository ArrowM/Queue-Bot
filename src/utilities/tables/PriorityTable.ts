import { Guild, GuildMember, Role, Snowflake } from "discord.js";
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

   public static get(guildId: Snowflake, roleMemberId: Snowflake) {
      return Base.knex<PriorityEntry>("priority")
         .where("guild_id", guildId)
         .where("role_member_id", roleMemberId)
         .first();
   }

   public static getMany(guildId: Snowflake) {
      return Base.knex<PriorityEntry>("priority").where("guild_id", guildId);
   }

   public static async isPriority(guildId: Snowflake, member: GuildMember) {
      const roleIds = member.roles.cache.keys();
      for (const id of [member.id, ...roleIds]) {
         const memberPerm = await Base.knex<PriorityEntry>("priority")
            .where("guild_id", guildId)
            .where("role_member_id", id)
            .first();
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
      await Base.knex<PriorityEntry>("priority")
         .where("guild_id", guildId)
         .where("role_member_id", roleMemberId)
         .first()
         .delete();
   }

   public static async validate(guild: Guild, members: GuildMember[], roles: Role[]): Promise<boolean> {
      let updateRequired = false;
      const storedEntries = await this.getMany(guild.id);
      for await (const entry of storedEntries) {
         if (entry.is_role) {
            const role = roles.find((r) => r.id === entry.role_member_id);
            if (role) {
               role.guild.roles.cache.set(role.id, role); // cache
            } else {
               await this.unstore(guild.id, entry.role_member_id);
               updateRequired = true;
            }
         } else {
            const member = members.find((m) => m.id === entry.role_member_id);
            if (member) {
               member.guild.members.cache.set(member.id, member); // cache
            } else {
               await this.unstore(guild.id, entry.role_member_id);
               updateRequired = true;
            }
         }
      }
      return updateRequired;
   }
}
