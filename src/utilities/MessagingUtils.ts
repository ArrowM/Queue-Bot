import { GuildChannel, Message, MessageActionRow, MessageButton, MessageEmbed, TextChannel, VoiceChannel } from "discord.js";
import { Base } from "./Base";
import { QueueGuild, QueueMember } from "./Interfaces";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";

export interface QueueUpdateRequest {
   queueGuild: QueueGuild;
   queueChannel: VoiceChannel | TextChannel;
}

export class MessagingUtils {
   private static gracePeriodCache = new Map<number, string>();
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
      const embeds = await this.generateEmbed(queueChannel);
      for await (const storedDisplayChannel of storedDisplayChannels) {
         // For each embed list of the queue
         try {
            const displayChannel = (await Base.getClient()
               .channels.fetch(storedDisplayChannel.display_channel_id)
               .catch(() => null)) as TextChannel;

            if (displayChannel) {
               if (
                  displayChannel.permissionsFor(displayChannel.guild.me).has("SEND_MESSAGES") &&
                  displayChannel.permissionsFor(displayChannel.guild.me).has("EMBED_LINKS")
               ) {
                  // Retrieved display embed
                  const message = await displayChannel.messages.fetch(storedDisplayChannel.message_id).catch(() => null as Message);
                  if (!message) continue;
                  if (queueGuild.msg_mode === 1) {
                     /* Edit */
                     await message
                        .edit({ embeds: embeds, components: MessagingUtils.getButton(queueChannel), allowedMentions: { users: [] } })
                        .catch(() => null as Message);
                  } else {
                     /* Replace */
                     await DisplayChannelTable.unstore(queueChannel.id, displayChannel.id, queueGuild.msg_mode !== 3);
                     await DisplayChannelTable.store(queueChannel, displayChannel, embeds);
                  }
               }
            } else {
               // Handled deleted display channels
               await DisplayChannelTable.unstore(queueChannel.id, storedDisplayChannel.display_channel_id);
            }
         } catch (e) {
            console.error(e);
         }
      }
   }

   /**
    * Return a grace period in string form
    * @param gracePeriod Guild id.
    */
   public static getGracePeriodString(gracePeriod: number): string {
      if (!this.gracePeriodCache.has(gracePeriod)) {
         let result;
         if (gracePeriod) {
            const graceMinutes = Math.floor(gracePeriod / 60);
            const graceSeconds = gracePeriod % 60;
            const timeString =
               (graceMinutes > 0 ? graceMinutes + " minute" : "") +
               (graceMinutes > 1 ? "s" : "") +
               (graceMinutes > 0 && graceSeconds > 0 ? " and " : "") +
               (graceSeconds > 0 ? graceSeconds + " second" : "") +
               (graceSeconds > 1 ? "s" : "");
            result = `\nIf you leave, you have **${timeString}** to rejoin to reclaim your spot.`;
         } else {
            result = "";
         }
         this.gracePeriodCache.set(gracePeriod, result);
      }
      return this.gracePeriodCache.get(gracePeriod);
   }

   /**
    *
    * @param queueChannel Discord message object.
    */
   public static async generateEmbed(queueChannel: TextChannel | VoiceChannel): Promise<MessageEmbed[]> {
      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      if (!storedQueueChannel) return [];
      let queueMembers = await QueueMemberTable.getNext(queueChannel);
      if (storedQueueChannel.max_members) queueMembers = queueMembers.slice(0, +storedQueueChannel.max_members);

      // Setup embed variables
      let title = queueChannel.name;
      if (storedQueueChannel.target_channel_id) {
         const targetChannel = (await queueChannel.guild.channels.fetch(storedQueueChannel.target_channel_id).catch(() => null)) as
            | VoiceChannel
            | TextChannel;
         if (targetChannel) {
            title += `  ->  ${targetChannel.name}`;
         } else {
            // Target has been deleted - clean it up
            await QueueChannelTable.updateTarget(queueChannel.id, Base.getKnex().raw("DEFAULT"));
         }
      }
      let position = 0;
      let description: string;
      if (queueChannel.type === "GUILD_VOICE") {
         description = `Join the **${queueChannel.name}** voice channel to join this queue.`;
      } else {
         description = `To interact, click the button or type \`/join ${queueChannel.name}\` or \`/leave ${queueChannel.name}\`.`;
      }
      description += await this.getGracePeriodString(storedQueueChannel.grace_period);
      if (queueMembers.some((member) => member.is_priority)) description += `\nPriority users are marked with a ⋆.`;
      if (storedQueueChannel.header) description += `\n\n${storedQueueChannel.header}`;

      let queueMembersSlice = queueMembers.slice(position, position + this.MAX_MEMBERS_PER_EMBED);

      const embeds: MessageEmbed[] = [];
      for (;;) {
         const embed = new MessageEmbed();
         embed.setTitle(title);
         embed.setColor(storedQueueChannel.color);
         embed.setDescription(description);
         if (queueMembersSlice?.length > 0) {
            // Handle non-empty
            const maxFieldCount = 25;
            for (let i = 0; i < queueMembersSlice.length / maxFieldCount; i++) {
               const pos = position % this.MAX_MEMBERS_PER_EMBED;
               const userList = queueMembersSlice
                  .slice(pos, pos + maxFieldCount)
                  .reduce(
                     (accumlator: string, queueMember: QueueMember) =>
                        (accumlator +=
                           `\`${++position < 10 ? position + " " : position}\` ` +
                           `${queueMember.is_priority ? "⋆" : ""}<@!${queueMember.member_id}>` +
                           (queueMember.personal_message ? " -- " + queueMember.personal_message : "") +
                           "\n"),
                     ""
                  );
               embed.addField("\u200b", userList, true);
            }
         } else {
            // Handle empty queue
            embed.addField("\u200b", "\u200b");
         }
         if (storedQueueChannel.max_members) {
            embed.fields[0].name = `Capacity:  ${queueMembers ? queueMembers.length : 0} / ${storedQueueChannel.max_members}`;
         } else {
            embed.fields[0].name = `Length:  ${queueMembers ? queueMembers.length : 0}`;
         }
         embeds.push(embed);
         // Setup for next 200 members (Keep at the bottom of loop. We want to generate 1 embed for empty queues).
         queueMembersSlice = queueMembers.slice(position, position + this.MAX_MEMBERS_PER_EMBED);
         if (queueMembersSlice.length === 0) break;
      }
      return embeds;
   }

   private static rows: MessageActionRow[] = [
      new MessageActionRow({
         components: [new MessageButton().setCustomId("joinLeave").setLabel("Join / Leave").setStyle("SECONDARY")],
      }),
   ];

   public static getButton(channel: GuildChannel) {
      return channel.type !== "GUILD_VOICE" ? this.rows : [];
   }
}
