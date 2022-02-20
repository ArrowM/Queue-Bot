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
import { QueueGuild } from "./Interfaces";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";
import { Validator } from "./Validator";
import { schedule as cronSchedule } from "node-cron";
import cronstrue from "cronstrue";

interface QueueUpdateRequest {
  queueGuild: QueueGuild;
  queueChannel: GuildBasedChannel;
}

export class MessagingUtils {
  private static gracePeriodCache = new Map<number, string>();
  private static pendingQueueUpdates: Map<string, QueueUpdateRequest> = new Map(); // <queue id, QueueUpdateRequest>

  /**
   * Send scheduled display updates every second
   * Necessary to comply with Discord API rate limits
   */
  public static startScheduler() {
    // Edit displays
    setInterval(() => {
      if (this.pendingQueueUpdates) {
        for (const request of this.pendingQueueUpdates.values()) {
          // noinspection JSIgnoredPromiseFromCall
          this.internalUpdateDisplay(request);
        }
        this.pendingQueueUpdates.clear();
      }
    }, 1000);
  }

  public static async startClearScheduler() {
    const storedQueues = await QueueChannelTable.getScheduledClears();
    for (const storedQueue of storedQueues) {
      const timezone = Base.getTimezone(+storedQueue.clear_utc_offset).timezone;
      const queueGuild = await QueueGuildTable.get(storedQueue.guild_id);
      const guild = Base.client.guilds.cache.get(storedQueue.guild_id);
      const queue = guild.channels.cache.get(storedQueue.queue_channel_id);
      cronSchedule(
        storedQueue.clear_schedule,
        async () => {
          await QueueMemberTable.unstore(storedQueue.guild_id, storedQueue.queue_channel_id);
          MessagingUtils.updateDisplay(queueGuild, queue);
        },
        {
          timezone: timezone,
        }
      );
    }
  }

  public static updateDisplay(queueGuild: QueueGuild, queueChannel: GuildBasedChannel): void {
    if (queueChannel) {
      this.pendingQueueUpdates.set(queueChannel.id, {
        queueGuild: queueGuild,
        queueChannel: queueChannel,
      });
    }
  }

  /**
   * Update a server's display messages
   * @param request
   */
  private static async internalUpdateDisplay(request: QueueUpdateRequest) {
    const queueGuild = request.queueGuild;
    const queueChannel = request.queueChannel;
    const storedDisplays = await DisplayChannelTable.getFromQueue(queueChannel.id);
    if (!storedDisplays || storedDisplays.length === 0) return;

    // Create an embed list
    const embeds = await this.generateEmbed(queueChannel);
    for await (const storedDisplay of storedDisplays) {
      // For each embed list of the queue
      try {
        const displayChannel = Base.client.channels.cache.get(storedDisplay.display_channel_id) as TextChannel;

        if (displayChannel) {
          if (
            displayChannel.permissionsFor(displayChannel.guild.me)?.has("SEND_MESSAGES") &&
            displayChannel.permissionsFor(displayChannel.guild.me)?.has("EMBED_LINKS")
          ) {
            // Retrieved display embed
            const message = await displayChannel.messages.fetch(storedDisplay.message_id).catch(() => null as Message);
            if (!message) continue;
            if (queueGuild.msg_mode === 1) {
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
              await DisplayChannelTable.unstore(queueChannel.id, displayChannel.id, queueGuild.msg_mode !== 3);
              await DisplayChannelTable.store(queueChannel, displayChannel, embeds);
            }
          }
        } else {
          // Handled deleted display channels
          await DisplayChannelTable.unstore(queueChannel.id, storedDisplay.display_channel_id);
        }
      } catch (e) {
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

  private static getTimestampFormat(queueGuild: QueueGuild): string {
    switch (queueGuild.timestamps) {
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
    const queueGuild = await QueueGuildTable.get(queueChannel.guild.id);
    const storedQueue = await QueueChannelTable.get(queueChannel.id);
    if (!storedQueue) return [];
    let queueMembers = await QueueMemberTable.getFromQueueOrdered(queueChannel);
    if (storedQueue.max_members) queueMembers = queueMembers.slice(0, +storedQueue.max_members);

    // Setup embed variables
    let title = (storedQueue.is_locked ? "🔒 " : "") + queueChannel.name;
    if (storedQueue.target_channel_id) {
      const targetChannel = queueChannel.guild.channels.cache.get(storedQueue.target_channel_id);
      if (targetChannel) {
        title += `  ->  ${targetChannel.name}`;
      } else {
        // Target has been deleted - clean it up
        await QueueChannelTable.setTarget(queueChannel.id, Base.knex.raw("DEFAULT"));
      }
    }

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
    if (storedQueue.clear_schedule) {
      const timezone = Base.getTimezone(+storedQueue.clear_utc_offset).value;
      description += `\nClears **${cronstrue.toString(storedQueue.clear_schedule)}** ${timezone}.`;
    }
    if (queueMembers.some((member) => member.is_priority)) description += `\nPriority users are marked with a ⋆.`;
    if (storedQueue.header) description += `\n\n${storedQueue.header}`;

    // Create a list of entries
    let position = 0;
    const entries: string[] = [];
    for (let i = 0; i < queueMembers.length; i++) {
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
      const idxStr = "`" + (++position < 10 ? position + " " : position) + "` ";
      const timeStr =
        queueGuild.timestamps !== "off"
          ? `<t:${Math.floor(queueMember.display_time.getTime() / 1000)}:${this.getTimestampFormat(queueGuild)}> `
          : "";
      const prioStr = `${queueMember.is_priority ? "⋆" : ""}`;
      const nameStr =
        queueGuild.disable_mentions && member?.displayName
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
    if (!field.value) field.value = "\u200b";
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

  private static rows: MessageActionRow[] = [
    new MessageActionRow({
      components: [new MessageButton().setCustomId("joinLeave").setLabel("Join / Leave").setStyle("SECONDARY")],
    }),
  ];

  public static async getButton(channel: GuildBasedChannel): Promise<MessageActionRow[]> {
    const storedQueue = await QueueChannelTable.get(channel.id);
    if (!["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(channel.type) && !storedQueue?.hide_button) {
      return this.rows;
    } else {
      return [];
    }
  }
}
