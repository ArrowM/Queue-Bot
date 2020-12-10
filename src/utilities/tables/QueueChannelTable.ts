import { Guild, NewsChannel, TextChannel, VoiceChannel } from "discord.js";
import { QueueChannel } from "../Interfaces";
import { Base } from "../Base";
import { DisplayChannelTable } from "./DisplayChannelTable";
import { QueueMemberTable } from "./QueueMemberTable";

export class QueueChannelTable {
   /**
    * Create & update QueueChannel database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("queue_channels")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("queue_channels", (table) => {
                     table.text("queue_channel_id").primary();
                     table.text("guild_id");
                     table.text("max_members");
                     table.text("target_channel_id");
                     table.text("header");
                     table.integer("auto_fill");
                     table.integer("pull_num");
                  })
                  .catch((e) => console.error(e));
            }
         });

      await this.updateTableStructure();
   }

   /**
    *
    * @param channelToAdd
    */
   public static async storeQueueChannel(
      channelToAdd: VoiceChannel | TextChannel | NewsChannel,
      maxMembers?: number
   ): Promise<void> {
      // Fetch old channels
      await Base.getKnex()<QueueChannel>("queue_channels")
         .insert({
            auto_fill: 1,
            guild_id: channelToAdd.guild.id,
            max_members: maxMembers?.toString(),
            pull_num: 1,
            queue_channel_id: channelToAdd.id,
            target_channel_id: null,
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
         await Base.getKnex()<QueueChannel>("queue_channels")
            .where("queue_channel_id", channelIdToRemove)
            .first()
            .del();
         await QueueMemberTable.unstoreQueueMembers(channelIdToRemove);
         await DisplayChannelTable.unstoreDisplayChannel(channelIdToRemove);
      } else {
         const storedQueueChannels = await Base.getKnex()<QueueChannel>("queue_channels").where("guild_id", guildId);
         for (const storedQueueChannel of storedQueueChannels) {
            await QueueMemberTable.unstoreQueueMembers(storedQueueChannel.queue_channel_id);
            await DisplayChannelTable.unstoreDisplayChannel(storedQueueChannel.queue_channel_id);
         }
         await Base.getKnex()<QueueChannel>("queue_channels").where("guild_id", guildId).del();
      }
   }

   /**
    *
    * @param guild
    */
   public static async fetchStoredQueueChannels(guild: Guild): Promise<(VoiceChannel | TextChannel | NewsChannel)[]> {
      const queueChannelIdsToRemove: string[] = [];
      // Fetch stored channels
      const storedQueueChannels = await Base.getKnex()<QueueChannel>("queue_channels").where("guild_id", guild.id);

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
   protected static async updateTableStructure(): Promise<void> {
      // Add max_members
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "max_members"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.text("max_members"));
      }
      // Add target_channel_id
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "target_channel_id"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.text("target_channel_id"));
      }
      // Add auto_fill
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "auto_fill"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.integer("auto_fill"));
         await Base.getKnex()<QueueChannel>("queue_channels").update("auto_fill", 1);
      }
      // Add pull_num
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "pull_num"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.integer("pull_num"));
         await Base.getKnex()<QueueChannel>("queue_channels").update("pull_num", 1);
      }
      // Add header
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "header"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.text("header"));
      }
   }
}
