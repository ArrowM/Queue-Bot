import { Message, MessageEmbed, MessageOptions, NewsChannel, TextChannel, VoiceChannel } from "discord.js";
import { QueueGuild, QueueMember } from "./Interfaces";
import { Base } from "./Base";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { SchedulingUtils } from "./SchedulingUtils";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";

export interface QueueUpdateRequest {
   queueGuild: QueueGuild;
   queueChannel: VoiceChannel | TextChannel | NewsChannel;
}

export class MessagingUtils {
   private static gracePeriodCache = new Map<string, string>();
   private static MAX_MEMBERS_PER_EMBED = 200;

   /**
    * Update a server's display messages
    * @param updateRequest
    */
   public static async updateQueueDisplays(updateRequest: QueueUpdateRequest): Promise<void> {
      const queueGuild = updateRequest.queueGuild;
      const queueChannel = updateRequest.queueChannel;

      const storedDisplayChannels = await DisplayChannelTable.getFromQueue(queueChannel.id);
      if (!storedDisplayChannels || storedDisplayChannels.length === 0) {
         return;
      }

      // Create an embed list
      const embeds = await this.generateEmbed(queueGuild, queueChannel);
      for (const storedDisplayChannel of storedDisplayChannels) {
         // For each embed list of the queue
         try {
            const displayChannel = (await Base.getClient()
               .channels.fetch(storedDisplayChannel.display_channel_id)
               .catch(() => null)) as TextChannel | NewsChannel;

            if (displayChannel) {
               if (
                  displayChannel.permissionsFor(displayChannel.guild.me).has("SEND_MESSAGES") &&
                  displayChannel.permissionsFor(displayChannel.guild.me).has("EMBED_LINKS")
               ) {
                  if (queueGuild.msg_mode === 1) {
                     /* Edit */
                     // Retrieved display embed
                     const storedEmbeds: Message[] = [];
                     for (const id of storedDisplayChannel.embed_ids) {
                        const storedEmbed = await displayChannel.messages.fetch(id).catch(() => null);
                        if (storedEmbed) {
                           storedEmbeds.push(storedEmbed);
                        }
                     }

                     if (storedEmbeds.length === embeds.length) {
                        for (let i = 0; i < embeds.length; i++) {
                           await storedEmbeds[i].edit(embeds[i]).catch(() => null);
                        }
                        continue;
                     }
                     // Else, fall through and delete the old and store the new.
                  }
                  /* Replace */
                  await DisplayChannelTable.unstoreDisplayChannel(queueChannel.id, displayChannel.id, queueGuild.msg_mode !== 3);
                  await DisplayChannelTable.storeDisplayChannel(queueChannel, displayChannel, embeds);
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
    *
    * @param queueGuild
    * @param queueChannel Discord message object.
    */
   public static async generateEmbed(
      queueGuild: QueueGuild,
      queueChannel: TextChannel | NewsChannel | VoiceChannel
   ): Promise<MessageOptions[]> {
      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      if (!storedQueueChannel) return [];
      let queueMembers = await QueueMemberTable.getFromQueue(queueChannel.id).orderBy("created_at");
      if (storedQueueChannel.max_members) queueMembers = queueMembers.slice(0, +storedQueueChannel.max_members);

      // Setup embed variables
      let title = queueChannel.name;
      if (storedQueueChannel.target_channel_id) {
         const targetChannel = queueChannel.guild.channels.cache.get(storedQueueChannel.target_channel_id);
         if (targetChannel) {
            title += `  ->  ${targetChannel.name}`;
         } else {
            // Target has been deleted - clean it up
            await QueueChannelTable.get(queueChannel.id).update("target_channel_id", Base.getKnex().raw("DEFAULT"));
         }
      }
      let position = 0;
      let description: string;
      if (queueChannel.type === "voice") {
         description =
            `Join the **${queueChannel.name}** voice channel to join this queue.` +
            (await this.getGracePeriodString(queueGuild.grace_period));
      } else {
         description =
            `React with ${Base.getConfig().joinEmoji} or type \`${queueGuild.prefix}${Base.getCmdConfig().joinCmd} ` +
            `${queueChannel.name}\` to join or leave this queue.`;
      }
      if (storedQueueChannel.header) {
         description += `\n\n${storedQueueChannel.header}`;
      }

      let _queueMembers = queueMembers.slice(position, position + this.MAX_MEMBERS_PER_EMBED);

      const embeds: MessageOptions[] = [];
      for (;;) {
         const _embed = new MessageEmbed();
         _embed.setTitle(title);
         _embed.setColor(queueGuild.color);
         _embed.setDescription(description);
         if (_queueMembers?.length > 0) {
            // Handle non-empty
            const maxFieldCount = 25;
            for (let i = 0; i < _queueMembers.length / maxFieldCount; i++) {
               const pos = position % this.MAX_MEMBERS_PER_EMBED;
               const userList = _queueMembers
                  .slice(pos, pos + maxFieldCount)
                  .reduce(
                     (accumlator: string, queueMember: QueueMember) =>
                        (accumlator +=
                           `${++position} <@!${queueMember.queue_member_id}>` +
                           (queueMember.personal_message ? " -- " + queueMember.personal_message : "") +
                           "\n"),
                     ""
                  );
               _embed.addField("\u200b", userList, true);
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
         embeds.push({ embed: _embed });
         // Setup for next 200 members (Keep at the bottom of loop. We want to generate 1 embed for empty queues).
         _queueMembers = queueMembers.slice(position, position + this.MAX_MEMBERS_PER_EMBED);
         if (_queueMembers.length === 0) break;
      }
      return embeds;
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
         await message.react(emoji).catch(() => null);
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

   public static removeMentions(str: string, channel: TextChannel | NewsChannel | VoiceChannel): string {
      return str
         .replaceAll(/(<(@!?|#)\w+>)/gi, "")
         .replaceAll(channel.name, "")
         .trim();
   }
}
