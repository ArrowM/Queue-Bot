import { Message, MessageEmbed, MessageOptions, NewsChannel, TextChannel, VoiceChannel } from "discord.js";
import { DisplayChannel, QueueChannel, QueueGuild, QueueMember } from "./Interfaces";
import { Base } from "./Base";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { Mutex } from "async-mutex";

interface QueueUpdateRequest {
   queueGuild: QueueGuild;
   queueChannel: VoiceChannel | TextChannel;
   silentUpdate: boolean;
}

export class MessageUtils extends Base {
   private static queueLock = new Mutex();
   private static pendingQueueUpdates: Map<string, QueueUpdateRequest> = new Map(); // <queue id, QueueUpdateRequest>
   private static responseLock = new Mutex();
   private static pendingResponses: Map<TextChannel | NewsChannel, MessageOptions> = new Map();
   private static gracePeriodCache = new Map();
   /**
    * Send scheduled display updates every 1.1 seconds
    * Necessary to comply with Discord API rate limits
    */
   public static async startScheduler() {
      setInterval(() => {
         // Queue Displays
         this.queueLock.runExclusive(() => {
            if (this.pendingQueueUpdates) {
               for (const request of this.pendingQueueUpdates.values()) {
                  this.updateQueueDisplays(request);
                  //console.log(Date.now() + " - " + request.queueChannel.name);
               }
               this.pendingQueueUpdates.clear();
            }
         });
         // Other Messages
         this.responseLock.runExclusive(() => {
            if (this.pendingResponses) {
               for (const [key, value] of this.pendingResponses) {
                  key.send(value).catch(() => console.error);
                  //console.log(Date.now() + " ~ response");
               }
               this.pendingResponses.clear();
            }
         });
      }, 1100);
   }

   /**
    * Schedule a queue channel to have it's displays updated
    * @param _queueGuild
    * @param _queueChannels
    * @param _silentUpdate
    */
   public static async scheduleDisplayUpdate(
      _queueGuild: QueueGuild,
      _queueChannel: VoiceChannel | TextChannel,
      _silentUpdate?: boolean
   ): Promise<void> {
      if (_queueChannel) {
         this.queueLock.runExclusive(() => {
            this.pendingQueueUpdates.set(_queueChannel.id, {
               queueGuild: _queueGuild,
               queueChannel: _queueChannel,
               silentUpdate: _silentUpdate,
            });
         });
      }
   }

   /**
    * Update a server's display messages
    * @param queueGuild
    * @param queueChannels Channels to update
    */
   public static async updateQueueDisplays(updateRequest: QueueUpdateRequest): Promise<void> {
      const queueGuild = updateRequest.queueGuild;
      const queueChannel = updateRequest.queueChannel;

      const storedDisplayChannels = await this.knex<DisplayChannel>("display_channels").where("queue_channel_id", queueChannel.id);
      if (!storedDisplayChannels || storedDisplayChannels.length === 0) {
         return;
      }

      // Create an embed list
      const msgEmbed = await MessageUtils.generateEmbed(queueGuild, queueChannel);

      for (const storedDisplayChannel of storedDisplayChannels) {
         // For each embed list of the queue
         try {
            const displayChannel: TextChannel = await this.client.channels.fetch(storedDisplayChannel.display_channel_id).catch(() => null);

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
                        await storedEmbed.edit(msgEmbed).catch(() => console.error);
                        continue;
                     }
                  }
                  /* Replace */
                  await DisplayChannelTable.unstoreDisplayChannel(queueChannel.id, displayChannel.id, queueGuild.msg_mode !== 3);
                  await DisplayChannelTable.storeDisplayChannel(queueChannel, displayChannel, msgEmbed);
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
    * Schedule a message to be sent
    * @param message
    * @param messageToSend
    */
   public static async scheduleResponse(message: Message, messageToSend: MessageOptions | string): Promise<void> {
      const destination = message.channel as TextChannel | NewsChannel;
      if (
         destination.permissionsFor(message.guild.me).has("SEND_MESSAGES") &&
         destination.permissionsFor(message.guild.me).has("EMBED_LINKS")
      ) {
         // Schedule to response to channel
         this.responseLock.runExclusive(() => {
            let existingPendingResponse = this.pendingResponses.get(destination) || {};
            if (typeof messageToSend === "string") {
               if (existingPendingResponse.content) {
                  existingPendingResponse.content += "\n" + messageToSend;
               } else {
                  existingPendingResponse.content = messageToSend;
               }
            } else {
               if (existingPendingResponse.embed) {
                  destination.send(existingPendingResponse);
               }
               existingPendingResponse = messageToSend;
            }
            this.pendingResponses.set(destination, existingPendingResponse);
         });
      } else {
         message.author.send(`I don't have permission to write messages and embeds in \`${destination.name}\``).catch(() => null);
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
   public static async generateEmbed(queueGuild: QueueGuild, queueChannel: TextChannel | VoiceChannel): Promise<MessageOptions> {
      const storedQueueChannel = await this.knex<QueueChannel>("queue_channels").where("queue_channel_id", queueChannel.id).first();
      const queueMembers = (
         await this.knex<QueueMember>("queue_members").where("queue_channel_id", queueChannel.id).orderBy("created_at")
      ).slice(0, +storedQueueChannel.max_members || 625);

      const _embed = new MessageEmbed();
      _embed.setTitle(
         queueChannel.name + (storedQueueChannel.max_members ? `  -  ${queueMembers.length}/${storedQueueChannel.max_members}` : "")
      );
      _embed.setColor(queueGuild.color);
      _embed.setDescription(
         queueChannel.type === "voice"
            ? // Voice
              `Join the **${queueChannel.name}** voice channel to join this queue.` +
                 (await this.getGracePeriodString(queueGuild.grace_period))
            : // Text
              `Type \`${queueGuild.prefix}${this.config.joinCmd} ${queueChannel.name}\` to join or leave this queue.`
      );

      if (!queueMembers || queueMembers.length === 0) {
         // Handle empty queue
         _embed.addField("No members in queue.", "\u200b");
      } else {
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
                        (accumlator =
                           accumlator +
                           `${++position} <@!${queueMember.queue_member_id}>` +
                           (queueMember.personal_message ? " -- " + queueMember.personal_message : "") +
                           "\n"),
                     ""
                  )
            );
         }
         _embed.fields[0].name = `Queue length: **${queueMembers ? queueMembers.length : 0}**`;
      }

      return { embed: _embed };
   }
}
