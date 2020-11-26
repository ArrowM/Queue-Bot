import { Guild, NewsChannel, TextChannel, VoiceChannel } from "discord.js";
import { QueueChannel } from "../Interfaces";
import { Base } from "../Base";
import { DisplayChannelTable } from "./DisplayChannelTable";
import { QueueMemberTable } from "./QueueMemberTable";

export class QueueChannelTable extends Base {
   /**
    * Create & update QueueChannel database table if necessary
    */
   public static initTable(): void {
      this.knex.schema.hasTable("queue_channels").then(async (exists) => {
         if (!exists) {
            await this.knex.schema
               .createTable("queue_channels", (table) => {
                  table.text("queue_channel_id").primary();
                  table.text("guild_id");
                  table.text("max_members");
               })
               .catch((e) => console.error(e));
         }
      });

      this.updateTableStructure();
   }

   /**
    *
    * @param channelToAdd
    */
   public static async storeQueueChannel(channelToAdd: VoiceChannel | TextChannel | NewsChannel, maxMembers?: number): Promise<void> {
      // Fetch old channels
      await this.knex<QueueChannel>("queue_channels")
         .insert({
            guild_id: channelToAdd.guild.id,
            max_members: maxMembers?.toString(),
            queue_channel_id: channelToAdd.id,
         })
         .catch(() => null);
      if (channelToAdd.type === "voice") {
         await QueueMemberTable.storeQueueMembers(
            channelToAdd.id,
            channelToAdd.members.filter((member) => !member.user.bot).map((member) => member.id)
         );
      }
   }

   /**
    *
    * @param guild
    * @param channelIdToRemove
    */
   public static async unstoreQueueChannel(guildId: string, channelIdToRemove?: string): Promise<void> {
      if (channelIdToRemove) {
         await this.knex<QueueChannel>("queue_channels").where("queue_channel_id", channelIdToRemove).first().del();
         await QueueMemberTable.unstoreQueueMembers(channelIdToRemove);
         await DisplayChannelTable.unstoreDisplayChannel(channelIdToRemove);
      } else {
         const storedQueueChannels = await this.knex<QueueChannel>("queue_channels").where("guild_id", guildId);
         for (const storedQueueChannel of storedQueueChannels) {
            await QueueMemberTable.unstoreQueueMembers(storedQueueChannel.queue_channel_id);
            await DisplayChannelTable.unstoreDisplayChannel(storedQueueChannel.queue_channel_id);
         }
         await this.knex<QueueChannel>("queue_channels").where("guild_id", guildId).del();
      }
   }

   /**
    *
    * @param guild
    */
   public static async fetchStoredQueueChannels(guild: Guild): Promise<(VoiceChannel | TextChannel | NewsChannel)[]> {
      const queueChannelIdsToRemove: string[] = [];
      // Fetch stored channels
      const storedQueueChannels = await this.knex<QueueChannel>("queue_channels").where("guild_id", guild.id);
      if (!storedQueueChannels) return null;

      const queueChannels: (VoiceChannel | TextChannel | NewsChannel)[] = [];
      // Check for deleted channels
      // Going backwards allows the removal of entries while visiting each one
      for (let i = storedQueueChannels.length - 1; i >= 0; i--) {
         const queueChannelId = storedQueueChannels[i].queue_channel_id;
         const queueChannel = guild.channels.cache.get(queueChannelId) as VoiceChannel | TextChannel | NewsChannel;
         if (queueChannel) {
            // Still exists, add to return list
            queueChannels.push(queueChannel);
         } else {
            // Channel has been deleted, update database
            queueChannelIdsToRemove.push(queueChannelId);
         }
      }
      for (const queueChannelId of queueChannelIdsToRemove) {
         await this.unstoreQueueChannel(guild.id, queueChannelId);
      }
      return queueChannels;
   }

   /**
    * Modify the database structure for code patches
    */
   protected static updateTableStructure(): void {
      this.addMaxMembers();
   }

   /**
    * Add max_members column
    */
   private static async addMaxMembers(): Promise<void> {
      if (!(await this.knex.schema.hasColumn("queue_channels", "max_members"))) {
         await this.knex.schema.table("queue_channels", (table) => table.text("max_members"));
      }
   }
}
