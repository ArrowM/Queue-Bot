import {
  DiscordAPIError,
  EmbedFieldData,
  GuildChannel,
  GuildMember,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import { Base } from "./Base";
import { QueueGuild } from "./Interfaces";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";
import { Validator } from "./Validator";

export interface QueueUpdateRequest {
  queueGuild: QueueGuild;
  queueChannel: VoiceChannel | StageChannel | TextChannel;
}

export class MessagingUtils {
  private static gracePeriodCache = new Map<number, string>();

  /**
   * Update a server's display messages
   * @param updateRequest
   */
  public static async updateQueueDisplays(updateRequest: QueueUpdateRequest): Promise<void> {
    const queueGuild = updateRequest.queueGuild;
    const queueChannel = updateRequest.queueChannel;
    const storedDisplayChannels = await DisplayChannelTable.getFromQueue(queueChannel.id);
    if (!storedDisplayChannels || storedDisplayChannels.length === 0) return;

    // Create an embed list
    const embeds = await this.generateEmbed(queueChannel);
    for await (const storedDisplayChannel of storedDisplayChannels) {
      // For each embed list of the queue
      try {
        const displayChannel = (await Base.client.channels
          .fetch(storedDisplayChannel.display_channel_id)
          .catch(() => null)) as TextChannel;

        if (displayChannel) {
          if (
            displayChannel.permissionsFor(displayChannel.guild.me)?.has("SEND_MESSAGES") &&
            displayChannel.permissionsFor(displayChannel.guild.me)?.has("EMBED_LINKS")
          ) {
            // Retrieved display embed
            const message = await displayChannel.messages
              .fetch(storedDisplayChannel.message_id)
              .catch(() => null as Message);
            if (!message) continue;
            if (queueGuild.msg_mode === 1) {
              /* Edit */
              await message
                .edit({
                  embeds: embeds,
                  components: await MessagingUtils.getButton(queueChannel),
                  allowedMentions: { users: [] },
                })
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
      Validator.validateGuild(queueChannel.guild).catch(() => null);
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
        result =
          (graceMinutes > 0 ? graceMinutes + " minute" : "") +
          (graceMinutes > 1 ? "s" : "") +
          (graceMinutes > 0 && graceSeconds > 0 ? " and " : "") +
          (graceSeconds > 0 ? graceSeconds + " second" : "") +
          (graceSeconds > 1 ? "s" : "");
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
  public static async generateEmbed(queueChannel: TextChannel | VoiceChannel | StageChannel): Promise<MessageEmbed[]> {
    const queueGuild = await QueueGuildTable.get(queueChannel.guild.id);
    const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
    if (!storedQueueChannel) return [];
    let queueMembers = await QueueMemberTable.getNext(queueChannel);
    if (storedQueueChannel.max_members) queueMembers = queueMembers.slice(0, +storedQueueChannel.max_members);

    // Setup embed variables
    let title = queueChannel.name;
    if (storedQueueChannel.target_channel_id) {
      const targetChannel = (await queueChannel.guild.channels
        .fetch(storedQueueChannel.target_channel_id)
        .catch(() => null)) as VoiceChannel | StageChannel | TextChannel;
      if (targetChannel) {
        title += `  ->  ${targetChannel.name}`;
      } else {
        // Target has been deleted - clean it up
        await QueueChannelTable.updateTarget(queueChannel.id, Base.knex.raw("DEFAULT"));
      }
    }

    let description: string;
    if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel.type)) {
      description = `Join <#${queueChannel.id}> to join this queue.`;
    } else {
      description = `To interact, click the button or use \`/join\` & \`/leave\`.`;
    }
    const timeString = this.getGracePeriodString(storedQueueChannel.grace_period);
    if (timeString) description += `\nIf you leave, you have ** ${timeString}** to rejoin to reclaim your spot.`;

    if (queueMembers.some((member) => member.is_priority)) description += `\nPriority users are marked with a ⋆.`;
    if (storedQueueChannel.header) description += `\n\n${storedQueueChannel.header}`;

    // Create a list of entries
    let position = 0;
    const entries: string[] = [];
    for (let i = 0, l = queueMembers.length; i < l; i++) {
      const queueMember = queueMembers[i];
      let member: GuildMember;
      if (queueGuild.disable_mentions) {
        member = await queueChannel.guild.members.fetch(queueMember.member_id).catch(async (e: DiscordAPIError) => {
          if ([403, 404].includes(e.httpStatus)) {
            await QueueMemberTable.unstore(queueChannel.guild.id, queueChannel.id, [queueMember.member_id]);
          }
          return null;
        });
        if (!member) continue;
      }
      // Create entry string
      entries.push(
        `\`${++position < 10 ? position + " " : position}\` ` +
          `${queueMember.is_priority ? "⋆" : ""}` +
          (queueGuild.disable_mentions && member?.displayName
            ? `\`${member.displayName}#${member?.user?.discriminator}\``
            : `<@${queueMember.member_id}>`) +
          (queueMember.personal_message ? " -- " + queueMember.personal_message : "") +
          "\n"
      );
    }

    const firstFieldName = storedQueueChannel.max_members
      ? `Capacity:  ${position} / ${storedQueueChannel.max_members}`
      : `Length:  ${position}`;

    const embeds: MessageEmbed[] = [];
    let embedLength = title.length + description.length + firstFieldName.length;
    let fields: EmbedFieldData[] = [];
    let field: EmbedFieldData = { name: "\u200b", value: "", inline: true };

    for (let i = 0, l = entries.length; i < l; i++) {
      const entry = entries[i];
      if (embedLength + entry.length >= 6000) {
        // New Message Needed - TODO support multiple messages?
        break;
      }
      if (field.value.length + entry.length >= 1024) {
        fields.push(field);
        field = { name: "\u200b", value: "", inline: true };
        embedLength += 1;
      }
      field.value += entry;
      embedLength += entry.length;
    }
    // Add the remaining fields to embeds
    if (!field.value) field.value = "\u200b";
    fields.push(field);
    const embed = new MessageEmbed();
    embed.setTitle(title);
    embed.setColor(storedQueueChannel.color);
    embed.setDescription(description);
    embed.setFields(fields);
    embed.fields[0].name = firstFieldName;
    embeds.push(embed);

    return embeds;
  }

  private static rows: MessageActionRow[] = [
    new MessageActionRow({
      components: [new MessageButton().setCustomId("joinLeave").setLabel("Join / Leave").setStyle("SECONDARY")],
    }),
  ];

  public static async getButton(channel: GuildChannel) {
    const storedQueueChannel = await QueueChannelTable.get(channel.id);
    if (!["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(channel.type) && !storedQueueChannel?.hide_button) {
      return this.rows;
    } else {
      return [];
    }
  }
}
