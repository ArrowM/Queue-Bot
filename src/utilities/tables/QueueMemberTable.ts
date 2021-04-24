import { QueueMember } from "../Interfaces";
import { Base } from "../Base";
import { GuildChannel } from "discord.js";

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
                     table.text("queue_channel_id");
                     table.text("queue_member_id");
                     table.text("personal_message");
                     table.timestamp("created_at").defaultTo(Base.getKnex().fn.now());
                  })
                  .catch((e) => console.error(e));
            }
         });

      await this.updateTableStructure();
   }

   /**
    * @param queueChannelId
    * @param queueMemberId
    */
   public static get(queueChannelId: string, queueMemberId: string) {
      return Base.getKnex()<QueueMember>("queue_members")
         .where("queue_channel_id", queueChannelId)
         .where("queue_member_id", queueMemberId)
         .first();
   }

   /**
    * @param queueChannelId
    * @param queueMemberIds
    */
   public static getMany(queueChannelId: string, queueMemberIds: string[]) {
      return Base.getKnex()<QueueMember>("queue_members")
         .where("queue_channel_id", queueChannelId)
         .whereIn("queue_member_id", queueMemberIds);
   }

   /**
    * @param queueMemberId
    */
   public static getFromMember(queueMemberId: string) {
      return Base.getKnex()<QueueMember>("queue_members").where("queue_member_id", queueMemberId);
   }

   /**
    * @param queueChannel
    * @param order - optional
    * Fetch members for channel, filter out users who have left the guild.
    */
   public static async getFromQueue(queueChannel: GuildChannel, order?: string) {
      const storedMembers = order
         ? await Base.getKnex()<QueueMember>("queue_members").where("queue_channel_id", queueChannel.id).orderBy(order)
         : await Base.getKnex()<QueueMember>("queue_members").where("queue_channel_id", queueChannel.id);
      storedMembers.filter(async (storedMember) => {
         try {
            storedMember.member = await queueChannel.guild.members.fetch(storedMember.queue_member_id);
            return true;
         } catch (e) {
            return false;
         }
      });
      return storedMembers;
   }

   /**
    * @param queueChannelId
    * @param memberIdsToAdd
    * @param personalMessage
    */
   public static async storeQueueMembers(queueChannelId: string, memberIdsToAdd: string[], personalMessage?: string): Promise<void> {
      for (const memberId of memberIdsToAdd) {
         await Base.getKnex()<QueueMember>("queue_members").insert({
            personal_message: personalMessage,
            queue_channel_id: queueChannelId,
            queue_member_id: memberId,
            created_at: this.unstoredMembersCache.get(memberId),
         });
         this.unstoredMembersCache.delete(memberId);
      }
   }

   private static unstoredMembersCache = new Map<string, string>();

   /**
    * @param queueChannelId
    * @param memberIdsToRemove
    */
   public static async unstoreQueueMembers(queueChannelId: string, memberIdsToRemove?: string[], gracePeriod?: string): Promise<void> {
      // Retreive list of stored embeds for display channel
      if (memberIdsToRemove) {
         if (gracePeriod) {
            // Cache members
            const queueMembers = await Base.getKnex()<QueueMember>("queue_members")
               .where("queue_channel_id", queueChannelId)
               .whereIn("queue_member_id", memberIdsToRemove);
            for (const queueMember of queueMembers) {
               this.unstoredMembersCache.set(queueMember.queue_member_id, queueMember.created_at);
               // Schedule cleanup of cached member
               setTimeout(() => this.unstoredMembersCache.delete(queueMember.queue_member_id), +gracePeriod * 1000);
            }
         }
         // Unstore
         await Base.getKnex()<QueueMember>("queue_members")
            .where("queue_channel_id", queueChannelId)
            .whereIn("queue_member_id", memberIdsToRemove)
            .del();
      } else {
         await Base.getKnex()<QueueMember>("queue_members").where("queue_channel_id", queueChannelId).first().del();
      }
   }

   /**
    * Modify the database structure for code patches
    */
   protected static updateTableStructure(): void {}
}
