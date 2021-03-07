import { Base } from "../Base";
import { MemberPerm } from "../Interfaces";

export class MemberPermsTable {
   /**
    * Create & update DisplayChannel database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("member_perms")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("member_perms", (table) => {
                     table.increments("id").primary();
                     table.text("queue_channel_id");
                     table.text("member_id");
                     table.integer("perm");
                  })
                  .catch((e) => console.error(e));
            }
         });
      await this.updateTableStructure();
   }

   /**
    * @param queueChannelId
    * @param memberId
    */
   public static async isBlacklisted(queueChannelId: string, memberId: string): Promise<boolean> {
      const memberPerm = await Base.getKnex()<MemberPerm>("member_perms")
         .where("queue_channel_id", queueChannelId)
         .where("member_id", memberId)
         .first();
      if (memberPerm) {
         return memberPerm.perm === 0;
      } else {
         return false;
      }
   }

   /**
    * @param queueChannelId
    * @param memberId
    */
   public static get(queueChannelId: string, memberId: string) {
      return Base.getKnex()<MemberPerm>("member_perms").where("queue_channel_id", queueChannelId).where("member_id", memberId).first();
   }

   /**
    * @param queueChannelId
    */
   public static getFromQueue(queueChannelId: string, perm: number) {
      return Base.getKnex()<MemberPerm>("member_perms").where("queue_channel_id", queueChannelId).where("perm", perm);
   }

   /**
    * @param queueChannelId
    * @param memberId
    * @param perm
    */
   public static async storeMemberPerm(queueChannelId: string, memberId: string, perm: number): Promise<void> {
      await Base.getKnex()<MemberPerm>("member_perms").insert({
         queue_channel_id: queueChannelId,
         member_id: memberId,
         perm: perm,
      });
   }

   /**
    * @param queueChannelId
    * @param memberId
    */
   public static async unstoreMemberPerm(queueChannelId: string, memberId?: string): Promise<void> {
      if (memberId) {
         await Base.getKnex()<MemberPerm>("member_perms").where("queue_channel_id", queueChannelId).where("member_id", memberId).delete();
      } else {
         await Base.getKnex()<MemberPerm>("member_perms").where("queue_channel_id", queueChannelId).del();
      }
   }

   /**
    * Modify the database structure for code patches
    */
   protected static async updateTableStructure(): Promise<void> {}
}
