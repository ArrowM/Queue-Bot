import { QueueChannel, QueueMember } from "../Interfaces";
import { Base } from "../Base";
import { Guild, GuildMember, Snowflake, TextChannel, VoiceChannel } from "discord.js";
import { BlackWhiteListTable } from "./BlackWhiteListTable";
import { PriorityTable } from "./PriorityTable";
import { QueueChannelTable } from "./QueueChannelTable";

export class QueueMemberTable {
   /**
    * Create & update QueueGuild database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("queue_members")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("queue_members", (table) => {
                     table.increments("id").primary();
                     table.bigInteger("channel_id");
                     table.bigInteger("member_id");
                     table.text("personal_message");
                     table.timestamp("created_at").defaultTo(Base.getKnex().fn.now());
                     table.boolean("is_priority");
                  })
                  .catch((e) => console.error(e));
            }
         });
   }

   /**
    * Cleanup deleted Display Channels
    **/
   public static async validateEntries(guild: Guild, queueChannel: VoiceChannel | TextChannel) {
      const entries = await Base.getKnex()<QueueMember>("queue_members").where("channel_id", queueChannel.id);
      for await (const entry of entries) {
         try {
            const member = await guild.members.fetch(entry.member_id);
            if (!member) {
               this.unstore(guild.id, queueChannel.id, [entry.member_id]);
            }
         } catch (e) {
            // SKIP
         }
      }
   }

   public static get(channelId: Snowflake, queueMemberId?: Snowflake) {
      return Base.getKnex()<QueueMember>("queue_members").where("channel_id", channelId).where("member_id", queueMemberId).first();
   }

   public static getFromId(id: Snowflake) {
      return Base.getKnex()<QueueMember>("queue_members").where("id", id).first();
   }

   public static getFromMember(queueMemberId: Snowflake) {
      return Base.getKnex()<QueueMember>("queue_members").where("member_id", queueMemberId);
   }

   public static async setCreatedAt(memberId: Snowflake, time: string): Promise<void> {
      await this.getFromId(memberId).update("created_at", time);
   }

   public static async setPriority(channelId: Snowflake, queueMemberId: Snowflake, isPriority: boolean): Promise<void> {
      await Base.getKnex()<QueueMember>("queue_members")
         .where("channel_id", channelId)
         .where("member_id", queueMemberId)
         .first()
         .update("is_priority", isPriority);
   }

   /**
    * UNORDERED. Fetch members for channel, filter out users who have left the guild.
    */
   public static async getFromQueue(queueChannel: TextChannel | VoiceChannel): Promise<QueueMember[]> {
      let query = Base.getKnex()<QueueMember>("queue_members").where("channel_id", queueChannel.id);

      const storedMembers = await query;
      for await (const storedMember of storedMembers) {
         storedMember.member = await queueChannel.guild.members.fetch(storedMember.member_id).catch(() => null as GuildMember);
      }
      return storedMembers.filter((storedMember) => storedMember.member);
   }

   /**
    * Fetch members for channel, filter out users who have left the guild.
    */
   public static async getNext(queueChannel: TextChannel | VoiceChannel, amount?: number): Promise<QueueMember[]> {
      let query = Base.getKnex()<QueueMember>("queue_members")
         .where("channel_id", queueChannel.id)
         .orderBy([{ column: "is_priority", order: "desc" }, "created_at"]);
      if (amount) query = query.limit(amount);

      const storedMembers = await query;
      for await (const storedMember of storedMembers) {
         storedMember.member = await queueChannel.guild.members.fetch(storedMember.member_id).catch(() => null as GuildMember);
      }
      return storedMembers.filter((storedMember) => storedMember.member);
   }

   private static unstoredMembersCache = new Map<Snowflake, string>();

   public static async store(
      queueChannel: VoiceChannel | TextChannel,
      member: GuildMember,
      customMessage?: string,
      force?: boolean
   ): Promise<boolean> {
      if ((await BlackWhiteListTable.isBlacklisted(queueChannel.id, member)) && !force) {
         return false;
      } else {
         const isPriority = await PriorityTable.isPriority(queueChannel.guild.id, member);
         await Base.getKnex()<QueueMember>("queue_members").insert({
            created_at: this.unstoredMembersCache.get(member.id),
            is_priority: isPriority,
            personal_message: customMessage,
            channel_id: queueChannel.id,
            member_id: member.id,
         });
         this.unstoredMembersCache.delete(member.id);
         // Assign Queue Role
         const StoredQueueChannel = await QueueChannelTable.get(queueChannel.id).catch(() => null as QueueChannel);
         if (StoredQueueChannel?.role_id) {
            await member.roles.add(StoredQueueChannel.role_id).catch(() => null);
         }
         return true;
      }
   }

   public static async unstore(guildId: Snowflake, channelId: Snowflake, memberIds?: Snowflake[], gracePeriod?: number): Promise<void> {
      // Retreive list of stored embeds for display channel
      let query = Base.getKnex()<QueueMember>("queue_members").where("channel_id", channelId);
      if (memberIds) {
         query = query.whereIn("member_id", memberIds);
         if (gracePeriod) {
            // Cache members
            for (const queueMember of await query) {
               this.unstoredMembersCache.set(queueMember.member_id, queueMember.created_at);
               // Schedule cleanup of cached member
               setTimeout(() => this.unstoredMembersCache.delete(queueMember.member_id), gracePeriod * 1000);
            }
         }
      }
      const deletedMembers = await query;
      await query.delete();
      // Unassign Queue Role
      const storedQueueChannel = await QueueChannelTable.get(channelId).catch(() => null as QueueChannel);
      if (!storedQueueChannel?.role_id) return;

      const guild = await Base.getClient()
         .guilds.fetch(guildId)
         .catch(() => null as Guild);
      if (!guild) return;

      for await (const deletedMember of deletedMembers) {
         const member = await guild.members.fetch(deletedMember.member_id).catch(() => null as GuildMember);
         if (!member) continue;
         await member.roles.remove(storedQueueChannel.role_id).catch(() => null);
      }
   }
}
