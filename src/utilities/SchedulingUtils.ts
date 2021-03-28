import { Message, MessageOptions, NewsChannel, TextChannel, VoiceChannel, VoiceState } from "discord.js";
import { QueueGuild } from "./Interfaces";
import { MessagingUtils, QueueUpdateRequest } from "./MessagingUtils";

export class SchedulingUtils {
   /**
    * Q: Why does this class exist?
    * A: Discord limits the rate at which bot can call the API. The relevant rates are
    *       Send messages:       5  / 6.5 sec   - 1 / 1300 ms
    *       Editting messages:   5  / 5.5 sec   - 1 / 1100 ms
    *       Moving members:      10 / 12  sec   - 1 / 1200 ms
    *    Discord JS attempts to meet these limits, but it can break when moving users.
    *
    * Q: So what are we rate limiting?
    * A: Moving members to avoid Discord JS bugs.
    */

   private static moveMembersTimeStamps = new Map<string, number[]>(); // <guild id, timestamps>
   private static pendingQueueUpdates: Map<string, QueueUpdateRequest> = new Map(); // <queue id, QueueUpdateRequest>
   private static pendingResponses: Map<TextChannel | NewsChannel, MessageOptions> = new Map();

   public static scheduleMoveMember(voice: VoiceState, channel: VoiceChannel) {
      let timestamps = this.moveMembersTimeStamps.get(channel.guild.id);
      if (!timestamps) {
         timestamps = [];
         this.moveMembersTimeStamps.set(channel.guild.id, timestamps);
      }
      let delay = 0;
      // At 10 previous moves, rate limit kicks in
      if (timestamps.length === 10) {
         const newTime = timestamps.shift() + 12000;
         timestamps.push(newTime);
         delay = newTime - Date.now();
      } else {
         timestamps.push(Date.now());
      }
      setTimeout(() => {
         if (!channel.full) {
            voice.setChannel(channel).catch(() => null);
         }
      }, delay);
      // EMPTY
   }

   /**
    * Send scheduled display updates every 1.1 seconds
    * Necessary to comply with Discord API rate limits
    */
   public static async startScheduler() {
      // Edit displays
      setInterval(() => {
         if (this.pendingQueueUpdates) {
            for (const request of this.pendingQueueUpdates.values()) {
               MessagingUtils.updateQueueDisplays(request);
            }
            this.pendingQueueUpdates.clear();
         }
      }, 1100);
      // Send new sessages
      setInterval(() => {
         if (this.pendingResponses) {
            for (const [key, value] of this.pendingResponses) {
               key.send(value).catch(() => null);
            }
            this.pendingResponses.clear();
         }
      }, 1300);
   }

   /**
    * Schedule a queue channel to have it's displays updated
    * @param _queueGuild
    * @param _queueChannels
    * @param _silentUpdate
    */
   public static scheduleDisplayUpdate(_queueGuild: QueueGuild, _queueChannel: VoiceChannel | TextChannel | NewsChannel): void {
      if (_queueChannel) {
         this.pendingQueueUpdates.set(_queueChannel.id, {
            queueGuild: _queueGuild,
            queueChannel: _queueChannel,
         });
      }
   }

   /**
    * Schedule a message to be sent
    * @param message
    * @param messageToSend
    */
   public static scheduleResponseToMessage(response: MessageOptions | string, message: Message): void {
      const channel = message.channel as TextChannel | NewsChannel;
      if (!this.scheduleResponseToChannel(response, channel)) {
         try {
            message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``);
         } catch (e) {
            if (e.code === 403) {
               MessagingUtils.sendTempMessage(
                  `I can't DM <@!${message.author.id}>. ` +
                     `Check your Server DM settings (Click the server name in the top left, then Privacy Settings)`,
                  channel,
                  10
               );
            }
         }
      }
   }

   /**
    * Attempt to send a response to channel, return false if bot lacks permissiosn.
    * @param response
    * @param channel
    */
   public static scheduleResponseToChannel(response: MessageOptions | string, channel: TextChannel | NewsChannel): boolean {
      if (channel.permissionsFor(channel.guild.me).has("SEND_MESSAGES") && channel.permissionsFor(channel.guild.me).has("EMBED_LINKS")) {
         // Schedule to response to channel
         let existingPendingResponse = this.pendingResponses.get(channel) || {};
         if (typeof response === "string") {
            if (existingPendingResponse.content) {
               existingPendingResponse.content += "\n" + response;
            } else {
               existingPendingResponse.content = response;
            }
         } else {
            if (existingPendingResponse.embed) {
               channel.send(existingPendingResponse).catch(() => null);
            }
            existingPendingResponse = response;
         }

         this.pendingResponses.set(channel, existingPendingResponse);
         return true;
      } else {
         return false;
      }
   }
}
