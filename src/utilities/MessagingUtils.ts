import { Message, MessageEmbed, MessageOptions, NewsChannel, TextChannel, VoiceChannel } from "discord.js";
import { DisplayChannel, QueueChannel, QueueGuild, QueueMember } from "./Interfaces";
import { Base } from "./Base";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { SchedulingUtils } from "./SchedulingUtils";

export interface QueueUpdateRequest {
   queueGuild: QueueGuild;
   queueChannel: VoiceChannel | TextChannel | NewsChannel;
   silentUpdate: boolean;
}

export class MessagingUtils {
   private static gracePeriodCache = new Map<string, string>();

   /**
    * Update a server's display messages
    * @param queueGuild
    * @param queueChannels Channels to update
    */
   public static async updateQueueDisplays(updateRequest: QueueUpdateRequest): Promise<void> {
      const queueGuild = updateRequest.queueGuild;
      const queueChannel = updateRequest.queueChannel;

      const storedDisplayChannels = await Base.getKnex()<DisplayChannel>("display_channels").where("queue_channel_id", queueChannel.id);
      if (!storedDisplayChannels || storedDisplayChannels.length === 0) {
         return;
      }

      // Create an embed list
      const displayEmbed = await this.generateEmbed(queueGuild, queueChannel);

      for (const storedDisplayChannel of storedDisplayChannels) {
         // For each embed list of the queue
         try {
            const displayChannel: TextChannel | NewsChannel = await Base.getClient()
               .channels.fetch(storedDisplayChannel.display_channel_id)
               .catch(() => null);

            if (displayChannel) {
               if (
                  displayChannel.permissionsFor(displayChannel.guild.me).has("SEND_MESSAGES") &&
                  displayChannel.permissionsFor(displayChannel.guild.me).has("EMBED_LINKS")
               ) {
                  if (queueGuild.msg_mode === 1 || updateRequest.silentUpdate) {
                     /* Edit */
                     // Retrieved display embed
                     const storedEmbed: Message = await displayChannel.messages.fetch(storedDisplayChannel.embed_id).catch(() => null);

                     if (storedEmbed) {
                        await storedEmbed.edit(displayEmbed).catch(() => null);
                        continue;
                     }
                  }
                  /* Replace */
                  await DisplayChannelTable.unstoreDisplayChannel(queueChannel.id, displayChannel.id, queueGuild.msg_mode !== 3);
                  await DisplayChannelTable.storeDisplayChannel(queueChannel, displayChannel, displayEmbed);
               }
            } else {
               // Handled deleted display channels
               await DisplayChannelTable.unstoreDisplayChannel(queueChannel.id, storedDisplayChannel.display_channel_id);
            }
         } catch (e) {
            // Skip
         }
      }
   }

   /**
    * Return a grace period in string form
    * @param gracePeriod Guild id.
    */
   public static async getGracePeriodString(gracePeriod: string): Promise<string> {
      if (!this.gracePeriodCache.has(gracePeriod)) {
         let result;
         if (gracePeriod === "0") {
            result = "";
         } else {
            const graceMinutes = Math.round(+gracePeriod / 60);
            const graceSeconds = +gracePeriod % 60;
            const timeString =
               (graceMinutes > 0 ? graceMinutes + " minute" : "") +
               (graceMinutes > 1 ? "s" : "") +
               (graceMinutes > 0 && graceSeconds > 0 ? " and " : "") +
               (graceSeconds > 0 ? graceSeconds + " second" : "") +
               (graceSeconds > 1 ? "s" : "");
            result = ` If you leave, you have ${timeString} to rejoin to reclaim your spot.`;
         }
         this.gracePeriodCache.set(gracePeriod, result);
      }
      return this.gracePeriodCache.get(gracePeriod);
   }

   /**
    * Create an Embed to represent everyone in a single queue. Will create multiple embeds for large queues
    * @param queueGuild
    * @param queueChannel Discord message object.
    */
   public static async generateEmbed(
      queueGuild: QueueGuild,
      queueChannel: TextChannel | NewsChannel | VoiceChannel
   ): Promise<MessageOptions> {
      const storedQueueChannel = await Base.getKnex()<QueueChannel>("queue_channels").where("queue_channel_id", queueChannel.id).first();
      const queueMembers = (
         await Base.getKnex()<QueueMember>("queue_members").where("queue_channel_id", queueChannel.id).orderBy("created_at")
      ).slice(0, +storedQueueChannel.max_members || 625);

      const _embed = new MessageEmbed();
      let title = queueChannel.name;
      if (storedQueueChannel.target_channel_id) {
         const targetChannel = queueChannel.guild.channels.cache.get(storedQueueChannel.target_channel_id);
         title += `  ->  ${targetChannel.name}`;
      }
      _embed.setTitle(title);
      _embed.setColor(queueGuild.color);
      _embed.setDescription(
         queueChannel.type === "voice"
            ? // Voice
              `Join the **${queueChannel.name}** voice channel to join this queue.` +
                 (await this.getGracePeriodString(queueGuild.grace_period))
            : // Text
              `React with ${Base.getConfig().joinEmoji} or type \`${queueGuild.prefix}${Base.getConfig().joinCmd} ${
                 queueChannel.name
              }\` to join or leave this queue.`
      );

      if (queueMembers && queueMembers.length > 0) {
         // Handle non-empty
         const maxEmbedSize = 25;
         let position = 0;
         for (let i = 0; i < queueMembers.length / maxEmbedSize; i++) {
            _embed.addField(
               "\u200b",
               queueMembers
                  .slice(position, position + maxEmbedSize)
                  .reduce(
                     (accumlator: string, queueMember: QueueMember) =>
                        (accumlator +=
                           `${++position} <@!${queueMember.queue_member_id}>` +
                           (queueMember.personal_message ? " -- " + queueMember.personal_message : "") +
                           "\n"),
                     ""
                  )
            );
         }
      } else {
         // Handle empty queue
         _embed.addField("\u200b", "\u200b");
      }
      if (storedQueueChannel.max_members) {
         _embed.fields[0].name = `Length: ${queueMembers ? queueMembers.length : 0} of ${storedQueueChannel.max_members}`;
      } else {
         _embed.fields[0].name = `Length: ${queueMembers ? queueMembers.length : 0}`;
      }
      return { embed: _embed };
   }

   /**
    *
    * @param message
    * @param emoji
    */
   public static async sendReaction(message: Message, emoji: string): Promise<void> {
      const channel = message.channel as TextChannel | NewsChannel;
      const channelPermissions = channel.permissionsFor(channel.guild.me);
      if (channelPermissions.has("ADD_REACTIONS")) {
         await message.react(emoji);
      } else {
         SchedulingUtils.scheduleResponseToChannel(
            "I can let people join via reaction, but I need a new permission.\n" +
               "I can be given permission in `Server Settings` > `Roles` > `Queue Bot` > enable `Add Reactions`.",
            channel
         );
      }
   }

   /**
    *
    * @param response
    * @param channel
    * @param duration
    */
   public static async sendTempMessage(response: string, channel: TextChannel | NewsChannel, duration: number): Promise<void> {
      const _response = (await channel.send(response).catch(() => null)) as Message;
      if (_response) {
         setTimeout(() => {
            _response.delete().catch(() => null);
         }, duration * 1000);
      }
   }
}
