import {
  ColorResolvable,
  DiscordAPIError,
  EmbedFieldData,
  GuildBasedChannel,
  GuildMember,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  TextBasedChannel,
  TextChannel,
} from "discord.js";

import { Base } from "./Base";
import { QUEUABLE_VOICE_CHANNELS, QueueUpdateRequest, StoredGuild } from "./Interfaces";
import { SchedulingUtils } from "./SchedulingUtils";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";
import { QueueTable } from "./tables/QueueTable";
import { Validator } from "./Validator";

export class MessagingUtils {
  private static gracePeriodCache = new Map<number, string>();

  public static async updateDisplay(request: QueueUpdateRequest) {
    const storedGuild = request.storedGuild;
    const queueChannel = request.queueChannel;
    const storedDisplays = await DisplayChannelTable.getFromQueue(queueChannel.id);
    if (!storedDisplays || storedDisplays.length === 0) {
      return;
    }

    const embedCache = new Map<boolean, MessageEmbed[]>(); // <inline, msg[]>
    // Create an embed list
    for await (const storedDisplay of storedDisplays) {
      let embeds: MessageEmbed[];
      if (embedCache.has(storedDisplay.is_inline)) {
        embeds = embedCache.get(storedDisplay.is_inline);
      } else {
        embeds = await this.generateEmbed(queueChannel, storedDisplay.is_inline);
        embedCache.set(storedDisplay.is_inline, embeds);
      }

      // For each embed list of the queue
      try {
        const displayChannel = (await Base.client.channels.fetch(storedDisplay.display_channel_id).catch(async (e) => {
          if (e.httpStatus === 404) {
            // Handled deleted display channels
            await DisplayChannelTable.unstore(queueChannel.id, storedDisplay.display_channel_id);
          }
        })) as TextChannel;
        const message = await displayChannel?.messages?.fetch(storedDisplay.message_id).catch(() => null as Message);
        const perms = displayChannel?.permissionsFor(displayChannel.guild.me);
        if (displayChannel && message && perms?.has("SEND_MESSAGES") && perms?.has("EMBED_LINKS")) {
          // Retrieved display embed
          if (storedGuild.msg_mode === 1) {
            /* Edit */
            await message
              .edit({
                embeds: embeds,
                components: await MessagingUtils.getButton(queueChannel),
                allowedMentions: { users: [] },
              })
              .catch(() => null);
          } else {
            /* Replace */
            await DisplayChannelTable.unstore(queueChannel.id, displayChannel.id, storedGuild.msg_mode !== 3);
            await DisplayChannelTable.store(queueChannel, displayChannel, embeds, storedDisplay.is_inline);
          }
        }
      } catch (e: any) {
        console.error(e);
      }
    }
    // setTimeout(() => Validator.validateGuild(queueChannel.guild).catch(() => null), 1000);
    Validator.validateGuild(queueChannel.guild).catch(() => null);
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

  private static getTimestampFormat(storedGuild: StoredGuild): string {
    switch (storedGuild.timestamps) {
      case "time":
        return "t";
      case "date":
        return "D";
      case "date+time":
        return "f";
      case "relative":
        return "R";
      default:
        return "off";
    }
  }

  /**
   *
   * @param queueChannel Discord message object.
   * @param isInline
   */
  public static async generateEmbed(queueChannel: GuildBasedChannel, isInline: boolean): Promise<MessageEmbed[]> {
    const storedGuild = await QueueGuildTable.get(queueChannel.guild.id);
    const storedQueue = await QueueTable.get(queueChannel.id);
    if (!storedQueue) {
      return [];
    }
    let queueMembers = await QueueMemberTable.getFromQueueOrdered(queueChannel);

    // Title
    let title = `${storedQueue.is_locked ? "🔒 " : ""}` + `${storedQueue.mute ? "🔇 " : ""}` + queueChannel.name;
    if (storedQueue.target_channel_id) {
      const targetChannel = queueChannel.guild.channels.cache.get(storedQueue.target_channel_id);
      if (targetChannel) {
        title += `  ->  ${targetChannel.name}`;
      } else {
        // Target has been deleted - clean it up
        await QueueTable.setTarget(queueChannel.id, Base.knex.raw("DEFAULT"));
      }
    }
    // Description
    let description: string;
    if (storedQueue.is_locked) {
      description = "Queue is locked.";
    } else {
      // @ts-ignore
      if (QUEUABLE_VOICE_CHANNELS.includes(queueChannel.type)) {
        description = `Join ${queueChannel} to join this queue.`;
      } else {
        description = `To interact, click the button or use \`/join\` & \`/leave\`.`;
      }
    }
    const timeString = this.getGracePeriodString(storedQueue.grace_period);
    if (timeString) {
      description += `\nIf you leave, you have **${timeString}** to rejoin to reclaim your spot.`;
    }
    description += await SchedulingUtils.getSchedulesString(queueChannel.id);
    if (queueMembers.some((member) => member.is_priority)) {
      description += `\nPriority users are marked with a ⋆.`;
    }
    if (storedQueue.header) {
      description += `\n\n${storedQueue.header}`;
    }
    // Create a list of entries
    let position = 0;
    const entries: string[] = [];
    for await (const queueMember of queueMembers) {
      let member: GuildMember;
      if (storedGuild.disable_mentions) {
        member = await queueChannel.guild.members.fetch(queueMember.member_id).catch(async (e: DiscordAPIError) => {
          if ([403, 404].includes(e.httpStatus)) {
            await QueueMemberTable.unstore(queueChannel.guild.id, queueChannel.id, [queueMember.member_id]);
          }
          return null;
        });
        if (!member) {
          continue;
        }
      }
      // Create entry string
      const idxStr = "`" + (++position < 10 ? position + " " : position) + "` ";
      const timeStr =
        storedGuild.timestamps === "off"
          ? ""
          : `<t:${Math.floor(queueMember.display_time.getTime() / 1000)}:${this.getTimestampFormat(storedGuild)}> `;
      const prioStr = `${queueMember.is_priority ? "⋆" : ""}`;
      const nameStr =
        storedGuild.disable_mentions && member?.displayName
          ? `\`${member.displayName}#${member?.user?.discriminator}\``
          : `<@${queueMember.member_id}>`;
      const msgStr = queueMember.personal_message ? " -- " + queueMember.personal_message : "";

      entries.push(idxStr + timeStr + prioStr + nameStr + msgStr + "\n");
    }

    const firstFieldName = storedQueue.max_members ? `Capacity:  ${position} / ${storedQueue.max_members}` : `Length:  ${position}`;

    const embeds: MessageEmbed[] = [];
    let embedLength = title.length + description.length + firstFieldName.length;
    let fields: EmbedFieldData[] = [];
    let field: EmbedFieldData = { name: "\u200b", value: "", inline: isInline };

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (embedLength + entry.length >= 6000) {
        // New Message Needed - TODO support multiple messages?
        break;
      }
      if (field.value.length + entry.length >= 1024) {
        fields.push(field);
        field = { name: "\u200b", value: "", inline: isInline };
        embedLength += 1;
      }
      field.value += entry;
      embedLength += entry.length;
    }
    // Add the remaining fields to embeds
    if (!field.value) {
      field.value = "\u200b";
    }
    fields.push(field);
    const embed = new MessageEmbed();
    embed.setTitle(title);
    embed.setColor(storedQueue.color);
    embed.setDescription(description);
    embed.setFields(fields);
    embed.fields[0].name = firstFieldName;
    embeds.push(embed);

    return embeds;
  }

  private static button: MessageActionRow[] = [
    new MessageActionRow().addComponents(new MessageButton().setCustomId("joinLeave").setLabel("Join / Leave").setStyle("SECONDARY")),
  ];

  public static async getButton(channel: GuildBasedChannel): Promise<MessageActionRow[]> {
    const storedQueue = await QueueTable.get(channel.id);
    // @ts-ignore
    if (!QUEUABLE_VOICE_CHANNELS.includes(channel.type) && !storedQueue?.hide_button) {
      return this.button;
    } else {
      return [];
    }
  }

  public static async logToLoggingChannel(
    command: string,
    content: string,
    author: GuildMember,
    storedGuild: StoredGuild,
    isEphemeral: boolean,
  ): Promise<void> {
    const loggingChannelId = storedGuild.logging_channel_id;
    const loggingChannelLevel = storedGuild.logging_channel_level;
    if (loggingChannelId && (!isEphemeral || loggingChannelLevel === 1)) {
      const loggingChannel = (await author.guild.channels.fetch(loggingChannelId).catch(async (e) => {
        if (e.httpStatus === 404) {
          // Handled deleted display channels
          await QueueGuildTable.setLoggingChannel(storedGuild.guild_id, Base.knex.raw("DEFAULT"), "default");
        }
      })) as TextBasedChannel;
      await loggingChannel
        ?.send({
          allowedMentions: { users: [] },
          embeds: [
            {
              fields: [
                {
                  name: command,
                  value: content,
                },
              ],
              author: {
                name: author.user.tag,
                icon_url: author.displayAvatarURL(),
              },
              footer: {
                icon_url: author.guild.me.displayAvatarURL(),
                text: `${author.guild.me.displayName}`,
              },
              timestamp: Date.now(),
              color: this.getLoggingColor(command),
            },
          ],
        })
        .catch(async (e) => {
          if (e.httpStatus === 404) {
            // Handled deleted display channels
            await QueueGuildTable.setLoggingChannel(storedGuild.guild_id, Base.knex.raw("DEFAULT"), "default");
          }
        });
    }
  }

  private static getLoggingColor(command: string): ColorResolvable {
    // TODO - return red for errors
    switch (command) {
      case "enqueue":
      case "join":
        return "GREEN";
      case "next":
      case "dequeue":
      case "leave":
        return "ORANGE";
      default:
        return "DARKER_GREY";
    }
  }
}
