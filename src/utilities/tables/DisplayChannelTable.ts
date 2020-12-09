import { Message, MessageOptions, NewsChannel, TextChannel, VoiceChannel } from "discord.js";
import { DisplayChannel } from "../Interfaces";
import { Base } from "../Base";
import { MessagingUtils } from "../MessagingUtils";
import { SchedulingUtils } from "../SchedulingUtils";

export class DisplayChannelTable {
   /**
    * Create & update DisplayChannel database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("display_channels")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("display_channels", (table) => {
                     table.increments("id").primary();
                     table.text("queue_channel_id");
                     table.text("display_channel_id");
                     table.specificType("embed_ids", "text ARRAY");
                  })
                  .catch((e) => console.error(e));
            }
         });

      await this.updateTableStructure();
   }

   /**
    *
    * @param queueChannel
    * @param displayChannel
    * @param msgEmbed
    */
   public static async storeDisplayChannel(
      queueChannel: VoiceChannel | TextChannel | NewsChannel,
      displayChannel: TextChannel | NewsChannel,
      embeds: MessageOptions[]
   ): Promise<Message[]> {
      const displayPermissions = displayChannel.permissionsFor(displayChannel.guild.me);
      if (displayPermissions.has("SEND_MESSAGES") && displayPermissions.has("EMBED_LINKS")) {
         const responses: Message[] = [];
         for (const embed of embeds) {
            const response = (await displayChannel.send(embed).catch(() => null)) as Message;
            if (response) {
               responses.push(response);
               if (queueChannel.type === "text") {
                  MessagingUtils.sendReaction(response, Base.getConfig().joinEmoji);
               }
            }
         }
         await Base.getKnex()<DisplayChannel>("display_channels").insert({
            display_channel_id: displayChannel.id,
            embed_ids: responses.map((response) => response.id),
            queue_channel_id: queueChannel.id,
         });
         return responses;
      }
   }

   /**
    *
    * @param queueChannelId
    * @param displayChannelIdToRemove
    * @param deleteOldDisplayMsg
    */
   public static async unstoreDisplayChannel(
      queueChannelId: string,
      displayChannelIdToRemove?: string,
      deleteOldDisplayMsg = true
   ): Promise<void> {
      let storedDisplayChannels: DisplayChannel[];

      // Retreive list of stored embeds for display channel
      if (displayChannelIdToRemove) {
         storedDisplayChannels = await Base.getKnex()<DisplayChannel>("display_channels")
            .where("queue_channel_id", queueChannelId)
            .where("display_channel_id", displayChannelIdToRemove);
         await Base.getKnex()<DisplayChannel>("display_channels")
            .where("queue_channel_id", queueChannelId)
            .where("display_channel_id", displayChannelIdToRemove)
            .del();
      } else {
         storedDisplayChannels = await Base.getKnex()<DisplayChannel>("display_channels").where(
            "queue_channel_id",
            queueChannelId
         );
         await Base.getKnex()<DisplayChannel>("display_channels").where("queue_channel_id", queueChannelId).del();
      }
      if (!storedDisplayChannels) return;

      // If found, delete them from discord
      for (const storedDisplayChannel of storedDisplayChannels) {
         try {
            const displayChannel = (await Base.getClient().channels.fetch(storedDisplayChannel.display_channel_id)) as
               | TextChannel
               | NewsChannel;
            for (let displayEmbed of storedDisplayChannel.embed_ids) {
               const displayMessage = await displayChannel.messages.fetch(displayEmbed, false);
               if (deleteOldDisplayMsg) {
                  await displayMessage.delete().catch(() => null);
               } else {
                  if (displayChannel.permissionsFor(displayChannel.guild.me).has("MANAGE_MESSAGES")) {
                     setTimeout(() => displayMessage.reactions.removeAll().catch(() => null), 1000); // Timeout to avoid rate limit
                  } else {
                     SchedulingUtils.scheduleResponseToChannel(
                        "I can clean up old queue reactions, but I need a new permission.\n" +
                           "I can be given permission in `Server Settings` > `Roles` > `Queue Bot` > enable `Manage Messages`.",
                        displayChannel
                     );
                  }
               }
            }
         } catch (e) {
            // EMPTY
         }
      }
   }

   /**
    * Modify the database structure for code patches
    */
   protected static async updateTableStructure(): Promise<void> {
      // Migration of embed_id to embed_ids
      if (await Base.getKnex().schema.hasColumn("display_channels", "embed_id")) {
         await Base.getKnex().schema.table("display_channels", (table) =>
            table.specificType("embed_ids", "text ARRAY")
         );
         (await Base.getKnex()<DisplayChannel>("display_channels")).forEach(async (displayChannel) => {
            await Base.getKnex()<DisplayChannel>("display_channels")
               .where("queue_channel_id", displayChannel.queue_channel_id)
               .where("display_channel_id", displayChannel.display_channel_id)
               .update("embed_ids", [displayChannel["embed_id"]]);
         });
         await Base.getKnex().schema.table("display_channels", (table) => table.dropColumn("embed_id"));
      }
   }
}
