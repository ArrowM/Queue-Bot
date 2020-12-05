import { QueueMember } from "../Interfaces";
import { Base } from "../Base";

export class QueueMemberTable {
   /**
    * Create & update QueueGuild database table if necessary
    */
   public static initTable(): void {
      Base.getKnex()
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

      this.updateTableStructure();
   }

   /**
    *
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
         });
      }
   }

   /**
    *
    * @param queueChannelId
    * @param memberIdsToRemove
    */
   public static async unstoreQueueMembers(queueChannelId: string, memberIdsToRemove?: string[]): Promise<void> {
      // Retreive list of stored embeds for display channel
      if (memberIdsToRemove) {
         await Base.getKnex()<QueueMember>("queue_members")
            .where("queue_channel_id", queueChannelId)
            .whereIn("queue_member_id", memberIdsToRemove)
            .first()
            .del();
      } else {
         await Base.getKnex()<QueueMember>("queue_members").where("queue_channel_id", queueChannelId).first().del();
      }
   }

   /**
    *
    */
   protected static updateTableStructure(): void {
      // Empty
   }
}
