import { StageChannel, TextChannel, VoiceChannel, VoiceState } from "discord.js";
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

   public static scheduleMoveMember(voice: VoiceState, channel: VoiceChannel | StageChannel) {
      try {
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
      } catch (e) {
         // EMPTY
      }
   }

   /**
    * Send scheduled display updates every 1.1 seconds
    * Necessary to comply with Discord API rate limits
    */
   public static startScheduler() {
      // Edit displays
      setInterval(() => {
         if (this.pendingQueueUpdates) {
            for (const request of this.pendingQueueUpdates.values()) {
               MessagingUtils.updateQueueDisplays(request);
            }
            this.pendingQueueUpdates.clear();
         }
      }, 1100);
   }

   /**
    * Schedule a queue channel to have it's displays updated
    * @param queueGuild
    * @param queueChannels
    */
   public static scheduleDisplayUpdate(queueGuild: QueueGuild, queueChannel: VoiceChannel | StageChannel | TextChannel): void {
      if (queueChannel) {
         this.pendingQueueUpdates.set(queueChannel.id, {
            queueGuild: queueGuild,
            queueChannel: queueChannel,
         });
      }
   }
}
