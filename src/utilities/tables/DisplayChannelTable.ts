import { Guild, Message, MessageEmbed, Snowflake, TextChannel, VoiceChannel } from "discord.js";
import { DisplayChannel } from "../Interfaces";
import { Base } from "../Base";
import { MessagingUtils } from "../MessagingUtils";

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
                     table.bigInteger("queue_channel_id");
                     table.bigInteger("display_channel_id");
                     table.bigInteger("message_id");
                  })
                  .catch((e) => console.error(e));
            }
         });
   }

   /**
    * Cleanup deleted Display Channels
    **/
   public static async validateEntries(guild: Guild, queueChannel: VoiceChannel | TextChannel) {
      const entries = await Base.getKnex()<DisplayChannel>("display_channels").where("queue_channel_id", queueChannel.id);
      for await (const entry of entries) {
         const displayChannel = (await guild.channels.fetch(entry.display_channel_id).catch(() => null)) as TextChannel;
         if (!displayChannel) {
            this.unstore(queueChannel.id, entry.display_channel_id);
         }
      }
   }

   public static get(displayChannelId: Snowflake) {
      return Base.getKnex()<DisplayChannel>("display_channels").where("display_channel_id", displayChannelId);
   }

   public static getFromQueue(queueChannelId: Snowflake) {
      return Base.getKnex()<DisplayChannel>("display_channels").where("queue_channel_id", queueChannelId);
   }

   public static getFromMessage(messageId: Snowflake) {
      return Base.getKnex()<DisplayChannel>("display_channels").where("message_id", messageId).first();
   }

   public static async store(queueChannel: VoiceChannel | TextChannel, displayChannel: TextChannel, embeds: MessageEmbed[]): Promise<void> {
      const displayPermission = displayChannel.permissionsFor(displayChannel.guild.me);
      if (displayPermission.has("SEND_MESSAGES") && displayPermission.has("EMBED_LINKS")) {
         const response = await displayChannel
            .send({ embeds: embeds, components: MessagingUtils.getButton(queueChannel), allowedMentions: { users: [] } })
            .catch(() => null as Message);
         if (!response) return;

         await Base.getKnex()<DisplayChannel>("display_channels").insert({
            display_channel_id: displayChannel.id,
            message_id: response.id,
            queue_channel_id: queueChannel.id,
         });
      }
   }

   public static async unstore(queueChannelId: Snowflake, displayChannelId?: Snowflake, deleteOldDisplays = true): Promise<void> {
      let query = Base.getKnex()<DisplayChannel>("display_channels").where("queue_channel_id", queueChannelId);
      if (displayChannelId) query = query.where("display_channel_id", displayChannelId);
      const storedDisplayChannels = await query;
      await query.delete();
      if (!storedDisplayChannels) return;

      for await (const storedDisplayChannel of storedDisplayChannels) {
         const displayChannel = (await Base.getClient()
            .channels.fetch(storedDisplayChannel.display_channel_id)
            .catch(() => null)) as TextChannel;
         if (!displayChannel) continue;

         const displayMessage = await displayChannel.messages
            .fetch(storedDisplayChannel.message_id, { cache: false })
            .catch(() => null as Message);
         if (!displayMessage) continue;

         if (deleteOldDisplays) {
            // Delete
            await displayMessage.delete().catch(() => null);
         } else {
            // Remove button
            await displayMessage.edit({ embeds: displayMessage.embeds, components: [] }).catch(() => null);
         }
      }
   }
}
