import {
  DiscordAPIError,
  EmbedFieldData,
  GuildBasedChannel,
  GuildMember,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  TextChannel,
} from "discord.js";
import { Base } from "./Base";
import { QueueUpdateRequest, StoredGuild } from "./Interfaces";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { QueueTable } from "./tables/QueueTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";
import { Validator } from "./Validator";
import { SchedulingUtils } from "./SchedulingUtils";
import {BlackWhiteListTable} from "./tables/BlackWhiteListTable";

export class MessagingUtils {
  private static gracePeriodCache = new Map<number, string>();

  public static async updateDisplay(request: QueueUpdateRequest) {
    const storedGuild = request.storedGuild;
    const queueChannel = request.queueChannel;
    const storedDisplays = await DisplayChannelTable.getFromQueue(queueChannel.id);
    if (!storedDisplays || storedDisplays.length === 0) {
      return;
    }

    // Create an embed list
    const embeds = await this.generateEmbed(queueChannel);
    for await (const storedDisplay of storedDisplays) {
      // For each embed list of the queue
      try {
        const displayChannel = await Base.client.channels.fetch(storedDisplay.display_channel_id).catch(async (e) => {
          if ([403, 404].includes(e.httpStatus)) {
            // Handled deleted display channels
            await DisplayChannelTable.unstore(queueChannel.id, storedDisplay.display_channel_id);
          }
        }) as TextChannel;
        const message = await displayChannel?.messages.fetch(storedDisplay.message_id).catch(() => null as Message);
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
            await DisplayChannelTable.store(queueChannel, displayChannel, embeds);
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
   */
  public static async generateEmbed(queueChannel: GuildBasedChannel): Promise<MessageEmbed[]> {
    const storedGuild = await QueueGuildTable.get(queueChannel.guild.id);
    const storedQueue = await QueueTable.get(queueChannel.id);
    if (!storedQueue) {
      return [];
    }
    let queueMembers = await QueueMemberTable.getFromQueueOrdered(queueChannel);
    if (storedQueue.max_members) {
      queueMembers = queueMembers.slice(0, +storedQueue.max_members);
    }

    // Title
    let title = `${storedQueue.is_locked ? "🔒 " : ""}${queueChannel.name}`;
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
      if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel.type)) {
        description = `Join <#${queueChannel.id}> to join this queue.`;
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

    const firstFieldName = storedQueue.max_members
      ? `Capacity:  ${position} / ${storedQueue.max_members}`
      : `Length:  ${position}`;

    const embeds: MessageEmbed[] = [];
    let embedLength = title.length + description.length + firstFieldName.length;
    let fields: EmbedFieldData[] = [];
    let field: EmbedFieldData = { name: "\u200b", value: "", inline: true };

    for (let i = 0; i < entries.length; i++) {
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
    new MessageActionRow().addComponents(
      new MessageButton()
        .setCustomId("joinLeave")
        .setLabel("Join / Leave")
        .setStyle("SECONDARY")
    )
  ];

  public static async getButton(channel: GuildBasedChannel): Promise<MessageActionRow[]> {
    const storedQueue = await QueueTable.get(channel.id);
    if (!["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(channel.type) && !storedQueue?.hide_button) {
      return this.button;
    } else {
      return [];
    }
  }
}
