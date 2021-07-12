import { Guild, GuildMember, Role, Snowflake, TextChannel, VoiceChannel } from "discord.js";
import { Base } from "../Base";
import { BlackWhiteListEntry } from "../Interfaces";

export class BlackWhiteListTable {
   /**
    * Create & update DisplayChannel database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("black_white_list")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("black_white_list", (table) => {
                     table.increments("id").primary();
                     table.bigInteger("queue_channel_id");
                     table.bigInteger("role_member_id");
                     table.integer("type");
                     table.boolean("is_role");
                  })
                  .catch((e) => console.error(e));
            }
         });
   }

   /**
    * Cleanup deleted Roles and Members
    **/
   public static async validateEntries(guild: Guild, queueChannel: VoiceChannel | TextChannel) {
      const entries = await Base.getKnex()<BlackWhiteListEntry>("black_white_list").where("queue_channel_id", queueChannel.id);
      for await (const entry of entries) {
         try {
            const roleMember =
               (await guild.roles.fetch(entry.role_member_id)) ||
               (await guild.members.fetch(entry.role_member_id));
            if (!roleMember) {
               this.unstore(2, queueChannel.id, entry.role_member_id);
            }
         } catch (e) {
            // SKIP
         }
      }
   }

   public static async isBlacklisted(queueChannelId: Snowflake, member: GuildMember): Promise<boolean> {
      const roleIds = member.roles.cache.array().map((role) => role.id);
      for (const id of [member.id, ...roleIds]) {
         const memberPerm = await Base.getKnex()<BlackWhiteListEntry>("black_white_list")
            .where("queue_channel_id", queueChannelId)
            .where("role_member_id", id)
            .where("type", 0)
            .first();
         if (memberPerm) return true;
      }
      return false;
   }

   public static get(type: number, queueChannelId: Snowflake, roleMemberId: Snowflake) {
      return Base.getKnex()<BlackWhiteListEntry>("black_white_list")
         .where("queue_channel_id", queueChannelId)
         .where("role_member_id", roleMemberId)
         .where("type", type)
         .first();
   }

   public static getMany(type: number, queueChannelId: Snowflake) {
      return Base.getKnex()<BlackWhiteListEntry>("black_white_list").where("queue_channel_id", queueChannelId).where("type", type);
   }

   public static async store(type: number, queueChannelId: Snowflake, roleMemberId: Snowflake, isRole: boolean): Promise<void> {
      await Base.getKnex()<BlackWhiteListEntry>("black_white_list").insert({
         queue_channel_id: queueChannelId,
         role_member_id: roleMemberId,
         type: type,
         is_role: isRole,
      });
   }

   /**
    * @param type - 0 black, 1 white, 2 both
    */
   public static async unstore(type: number, queueChannelId: Snowflake, roleMemberId?: Snowflake): Promise<void> {
      let query = Base.getKnex()<BlackWhiteListEntry>("black_white_list").where("queue_channel_id", queueChannelId);
      if (type !== 2) query = query.where("type", type);
      if (roleMemberId) query = query.where("role_member_id", roleMemberId);
      await query.delete();
   }
}
