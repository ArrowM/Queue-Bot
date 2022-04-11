import {
  TextChannel,
  VoiceChannel,
  GuildMember,
  MessageEmbed,
  MessageEmbedOptions,
  ColorResolvable,
  StageChannel,
  Role,
  GuildBasedChannel,
} from "discord.js";
import { BlackWhiteListEntry, Parsed, PriorityEntry, QueueChannel, QueueGuild } from "./utilities/Interfaces";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { Voice } from "./utilities/VoiceUtils";
import { AdminPermissionTable } from "./utilities/tables/AdminPermissionTable";
import { BlackWhiteListTable } from "./utilities/tables/BlackWhiteListTable";
import { PriorityTable } from "./utilities/tables/PriorityTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { Base } from "./utilities/Base";
import { Validator } from "./utilities/Validator";
import { schedule as cronSchedule, validate as cronValidate } from "node-cron";
import cronstrue from "cronstrue";

export class Commands {
  // --------------------------------- ENABLE PREFIX ------------------------------- //

  /**
   * the current alternate settings
   */
  public static async altPrefixGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 13 });
    await parsed
      .reply({
        content: "**Alt Prefix** (`!`): " + (parsed.queueGuild.enable_alt_prefix ? "on" : "off"),
      })
      .catch(() => null);
  }

  /**
   * Enable or disable alternate prefix
   */
  public static async altPrefixSet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 13, hasText: true })).length) return;

    if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else if (
      (parsed.queueGuild.enable_alt_prefix && parsed.args.text === "on") ||
      (!parsed.queueGuild.enable_alt_prefix && parsed.args.text === "off")
    ) {
      await parsed
        .reply({
          content: `Alternative prefixes were already ${parsed.args.text}.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      await QueueGuildTable.setAltPrefix(parsed.request.guild.id, parsed.args.text === "on");
      await parsed
        .reply({
          content: `Alternative prefixes have been turned **${parsed.args.text}**.`,
        })
        .catch(() => null);
    }
  }

  // --------------------------------- AUTOPULL ------------------------------- //

  /**
   * the current autopull settings
   */
  public static async autopullGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 12 });

    let response = "**Autopull**:\n";
    for await (const storedQueue of await parsed.getStoredQueues()) {
      const queueChannel = parsed.request.guild.channels.cache.get(storedQueue.queue_channel_id);
      if (!["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel?.type)) continue;
      response += `\`${queueChannel.name}\`: ${storedQueue.auto_fill ? "on" : "off"}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Toggle automatic pull of users from a queue
   */
  public static async autopullSet(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 12,
          hasChannel: true,
          channelType: ["GUILD_VOICE", "GUILD_STAGE_VOICE"],
          hasText: true,
        })
      ).length
    )
      return;

    if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      const queueChannel = parsed.args.channel;

      const value = parsed.args.text === "off" ? 0 : 1;
      await QueueChannelTable.setAutopull(queueChannel.id, value);
      await parsed
        .reply({
          content: `Set autopull of \`${queueChannel.name}\` to \`${parsed.args.text}\`.`,
        })
        .catch(() => null);
      MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    }
  }

  // --------------------------------- BLACKLIST / WHITELIST ------------------------------- //\

  /**
   * HELPER
   */
  private static async validateBWList(parsed: Parsed, type: number, storedEntries: BlackWhiteListEntry[]) {
    const promises = [];
    let removedAny = false;
    for (const entry of storedEntries) {
      promises.push(
        (entry.is_role ? parsed.request.guild.roles : parsed.request.guild.members)
          .fetch(entry.role_member_id)
          .catch((e) => {
            if ([403, 404].includes(e.httpStatus)) {
              BlackWhiteListTable.unstore(type, entry.queue_channel_id, entry.role_member_id);
              removedAny = true;
            }
          })
      );
    }
    await Promise.all(promises);
    if (removedAny) {
      setTimeout(
        async () =>
          await parsed
            .reply({
              content: `Removed 1 or more invalid members/roles from the ${type ? "white" : "black"}list.`,
            })
            .catch(() => null),
        1000
      );
    }
  }

  /**
   * HELPER
   */
  private static async genBWList(parsed: Parsed, type: number): Promise<string> {
    const typeString = type ? "White" : "Black";
    const storedEntries = await BlackWhiteListTable.getMany(type, parsed.args.channel.id);
    this.validateBWList(parsed, type, storedEntries).then();

    let response = `\n${typeString}list of \`${parsed.args.channel.name}\`: `;
    if (storedEntries?.length) {
      response += storedEntries
        .map((entry) => "<@" + (entry.is_role ? "&" : "") + entry.role_member_id + ">")
        .join(", ");
    } else {
      response += "Empty";
    }
    return response;
  }

  /**
   * HELPER
   */
  private static async _bwAdd(parsed: Parsed, type: number) {
    const queueChannel = parsed.args.channel;
    const member = parsed.args.member;
    const role = parsed.args.role;
    const id = member?.id || role?.id;
    if (!queueChannel?.id || !id) return;
    const name = member?.displayName || role?.name;
    const typeString = type ? "white" : "black";
    let response = "";

    if (await BlackWhiteListTable.get(type, queueChannel.id, id)) {
      response += `\`${name}\` is already on the ${typeString}list of \`${queueChannel.name}\`.`;
    } else {
      await BlackWhiteListTable.store(type, queueChannel.id, id, role != null);
      if (typeString === "black") {
        const members = role ? Array.from(role.members.values()) : [member];
        await this.dequeueFromQueue(parsed.queueGuild, queueChannel, members);
      }
      response += `Added \`${name}\` to the ${typeString}list of \`${queueChannel.name}\`.`;
    }
    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    response += await this.genBWList(parsed, type);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Add a user or role to blacklist or whitelist
   */
  public static async bwAdd(parsed: Parsed, isRole: boolean, isBlacklist: boolean) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 18,
          hasChannel: true,
          hasRole: isRole,
          hasMember: !isRole,
        })
      ).length
    )
      return;
    this._bwAdd(parsed, isBlacklist ? 0 : 1).then();
  }

  /**
   * HELPER
   */
  private static async _bwDelete(parsed: Parsed, type: number) {
    const queueChannel = parsed.args.channel;
    const member = parsed.args.member;
    const role = parsed.args.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    const typeString = type ? "white" : "black";
    let response = "";

    if (await BlackWhiteListTable.get(type, queueChannel.id, id)) {
      await BlackWhiteListTable.unstore(type, queueChannel.id, id);
      response += `Removed \`${name}\` from the ${typeString}list of \`${queueChannel.name}\`.`;
    } else {
      response += `\`${name}\` was not on the ${typeString}list of \`${queueChannel.name}\`.`;
    }

    response += await this.genBWList(parsed, type);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Remove a user or role from blacklist or whitelist
   */
  public static async bwDelete(parsed: Parsed, isRole: boolean, isBlacklist: boolean) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 18,
          hasChannel: true,
          hasRole: isRole,
          hasMember: !isRole,
        })
      ).length
    )
      return;
    this._bwDelete(parsed, isBlacklist ? 0 : 1).then();
  }

  /**
   * HELPER
   */
  private static async _bwList(parsed: Parsed, type: number) {
    const response = await this.genBWList(parsed, type);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Display a blacklist or whitelist
   */
  public static async bwList(parsed: Parsed, isBlacklist: boolean) {
    if ((await parsed.readArgs({ commandNameLength: 14, hasChannel: true })).length) return;
    this._bwList(parsed, isBlacklist ? 0 : 1).then();
  }

  /**
   * Clear a blacklist or whitelist
   */
  public static async bwClear(parsed: Parsed, isBlacklist: boolean) {
    if ((await parsed.readArgs({ commandNameLength: 15, hasChannel: true })).length) return;

    const queueChannel = parsed.args.channel;
    await BlackWhiteListTable.unstore(isBlacklist ? 0 : 1, queueChannel.id);
    const typeString = isBlacklist ? "black" : "white";
    await parsed
      .reply({
        content: `Cleared the ${typeString}list of \`${queueChannel.name}\`.`,
      })
      .catch(() => null);
  }

  // --------------------------------- BUTTON ------------------------------- //

  /**
   * Get button settings
   */
  public static async buttonGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 10 });

    let response = "**Buttons**:\n";
    for await (const storedQueue of await parsed.getStoredQueues()) {
      const queueChannel = parsed.request.guild.channels.cache.get(storedQueue.queue_channel_id);
      if (!["GUILD_TEXT"].includes(queueChannel?.type)) continue;
      response += `\`${queueChannel.name}\`: ${storedQueue.hide_button ? "off" : "on"}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Enable or disable the "Join / Leave" button for a queue
   */
  public static async buttonSet(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 10,
          hasChannel: true,
          channelType: ["GUILD_TEXT"],
          hasText: true,
        })
      ).length
    )
      return;

    const queueChannel = parsed.args.channel;

    if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      await QueueChannelTable.setHideButton(queueChannel.id, parsed.args.text === "off");
      await parsed
        .reply({
          content: `Set button of \`${queueChannel.name}\` to \`${parsed.args.text}\`.`,
        })
        .catch(() => null);
      MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    }
  }

  // --------------------------------- CLEAR ------------------------------- //

  /**
   * Clear a queue
   */
  public static async clear(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 5, hasChannel: true })).length) return;

    const queueChannel = parsed.args.channel;
    await QueueMemberTable.unstore(queueChannel.guild.id, queueChannel.id);
    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    await parsed
      .reply({
        content: `\`${queueChannel.name}\` queue cleared.`,
      })
      .catch(() => null);
  }

  // --------------------------------- COLOR ------------------------------- //

  /**
   * the current color settings
   */
  public static async colorGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 9 });

    let response = "**Colors**:\n";
    for await (const storedQueue of await parsed.getStoredQueues()) {
      const queueChannel = parsed.request.guild.channels.cache.get(storedQueue.queue_channel_id);
      if (!queueChannel) continue;
      response += `\`${queueChannel.name}\`: ${storedQueue.color}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set a new color for a queue
   */
  public static async colorSet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 9, hasChannel: true, hasText: true })).length) return;
    if (
      ![
        "default",
        "white",
        "aqua",
        "green",
        "blue",
        "yellow",
        "purple",
        "luminous_vivid_pink",
        "fuchsia",
        "gold",
        "orange",
        "red",
        "grey",
        "darker_grey",
        "navy",
        "dark_aqua",
        "dark_green",
        "dark_blue",
        "dark_purple",
        "dark_vivid_pink",
        "dark_gold",
        "dark_orange",
        "dark_red",
        "random",
      ].includes(parsed.args.text.toLowerCase())
    ) {
      await parsed
        .reply({
          content: "**ERROR**: Invalid color.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }

    const queueChannel = parsed.args.channel;

    await QueueChannelTable.setColor(queueChannel, parsed.args.text.toUpperCase() as ColorResolvable);
    await parsed
      .reply({
        content: `Set color of \`${queueChannel.name}\` to \`${parsed.args.text}\`.`,
      })
      .catch(() => null);
    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
  }

  // --------------------------------- DISPLAY ------------------------------- //

  /**
   * Display the users in a queue. These messages stay updated
   */
  public static async display(parsed: Parsed, channel?: GuildBasedChannel) {
    if ((await parsed.readArgs({ commandNameLength: 7, hasChannel: true })).length) return;

    const queueChannel = channel || parsed.args.channel;
    const displayChannel = parsed.request.channel as TextChannel;
    const displayPermission = displayChannel.permissionsFor(displayChannel.guild.me);
    if (
      displayPermission.has("VIEW_CHANNEL") &&
      displayPermission.has("SEND_MESSAGES") &&
      displayPermission.has("EMBED_LINKS")
    ) {
      const embeds = await MessagingUtils.generateEmbed(queueChannel);

      // Remove old display
      await DisplayChannelTable.unstore(queueChannel.id, displayChannel.id);
      // Create new display
      await DisplayChannelTable.store(queueChannel, displayChannel, embeds);
      if (!channel) {
        await parsed
          .reply({
            content: "Displayed.",
            messageDisplay: "NONE",
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
      }
    } else {
      await parsed
        .reply({
          content: `I don't have permission to write messages and embeds in \`${displayChannel.name}\`.`,
          messageDisplay: "DM",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }

    const storedQueue = await QueueChannelTable.get(queueChannel.id).catch(() => null as QueueChannel);
    if (storedQueue && !(storedQueue?.role_id || parsed.queueGuild.disable_roles)) {
      await QueueChannelTable.createQueueRole(parsed, queueChannel, storedQueue.color);
    }

    Validator.validateGuild(queueChannel.guild).catch(() => null);
  }

  // --------------------------------- ENQUEUE ------------------------------- //

  /**
   * HELPER
   */
  private static async enqueue(parsed: Parsed) {
    const queueChannel = parsed.args.channel as GuildBasedChannel;
    const member = parsed.args.member;
    const role = parsed.args.role;
    if (!queueChannel?.id || !(member || role)) return;

    if (queueChannel.type !== "GUILD_TEXT") {
      if (member?.voice?.channel?.id !== queueChannel.id || role) {
        await parsed
          .reply({
            content: `**ERROR**: \`/enqueue ${queueChannel.name}\` can only be used on users who are already in the \`${queueChannel.name}\` voice channel.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
        return;
      }
    }

    const customMessage = parsed.args.text?.substring(0, 128);
    if (member?.id) {
      try {
        await QueueMemberTable.store(queueChannel, member, customMessage, true);
        await parsed
          .reply({
            content: `Added <@${member.id}> to \`${queueChannel.name}\`.`,
          })
          .catch(() => null);
        MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
      } catch (e: any) {
        if (e.author === "Queue Bot") {
          await parsed
            .reply({
              content: "**ERROR**: " + e.message,
              commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
        } else {
          throw e;
        }
      }
    } else if (role?.id) {
      let errorAccumulator = "";
      const promises = [];
      for (const member of role.members.values()) {
        promises.push(
          QueueMemberTable.store(queueChannel, member, customMessage, true).catch((e) => {
            if (e.author === "Queue Bot") {
              errorAccumulator += e.message;
            }
          })
        );
      }
      await Promise.all(promises);
      const errorText = errorAccumulator ? "However, failed to add 1 or more members:\n" + errorAccumulator : "";
      await parsed
        .reply({
          content: `Added <@&${role.id}> to \`${queueChannel.name}\`.` + errorText,
        })
        .catch(() => null);
      MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    }
  }

  /**
   * Add a specified user to a text queue / Update queue message
   */
  public static async enqueueUser(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 12, hasChannel: true, hasMember: true })).length) return;

    await this.enqueue(parsed);
  }

  /**
   * Add a specified role to a text queue / Update queue message
   */
  public static async enqueueRole(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 12, hasChannel: true, hasRole: true })).length) return;

    await this.enqueue(parsed);
  }

  // --------------------------------- GRACEPERIOD ------------------------------- //

  /**
   * the current grace period settings
   */
  public static async graceperiodGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 15 });

    let response = "**Grace Periods**:\n";
    for await (const storedQueue of await parsed.getStoredQueues()) {
      const queueChannel = parsed.request.guild.channels.cache.get(storedQueue.queue_channel_id);
      if (!queueChannel) continue;
      const timeString = MessagingUtils.getGracePeriodString(storedQueue.grace_period);
      response += `\`${queueChannel.name}\`: ${timeString || "0 seconds"}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set how long a user can leave a queue before losing their spot
   */
  public static async graceperiodSet(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 15,
          hasChannel: true,
          hasNumber: { required: true, min: 0, max: 6000, defaultValue: null },
        })
      ).length
    )
      return;

    const queueChannel = parsed.args.channel;
    await QueueChannelTable.setGraceperiod(queueChannel.id, parsed.args.num);
    const timeString = MessagingUtils.getGracePeriodString(parsed.args.num);
    await parsed
      .reply({
        content: `Set grace period of \`${queueChannel.name}\` to \`${timeString || "0 seconds"}\`.`,
      })
      .catch(() => null);
    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
  }

  // --------------------------------- HEADER ------------------------------- //

  /**
   * Set or remove a header for a queue's display messages
   */
  public static async headerGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 10 });

    let response = "**Headers**:\n";
    for await (const storedQueue of await parsed.getStoredQueues()) {
      const queueChannel = parsed.request.guild.channels.cache.get(storedQueue.queue_channel_id);
      if (!queueChannel) continue;
      response += `\`${queueChannel.name}\`: ${storedQueue.header || "none"}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set or remove a header for a queue's display messages
   */
  public static async headerSet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 10, hasChannel: true })).length) return;

    const queueChannel = parsed.args.channel;
    const message = parsed.args.text || "";

    await QueueChannelTable.setHeader(queueChannel.id, message);
    await parsed
      .reply({
        content: `Updated \`${queueChannel.name}\` header.`,
      })
      .catch(() => null);
    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
  }

  // --------------------------------- HELP ------------------------------- //

  /**
   * Display general help messages
   */
  public static async help(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 4 });
    const alt = parsed.queueGuild.enable_alt_prefix;

    const response: MessageEmbedOptions = {
      title: "Commands for Everyone",
      fields: [
        {
          name: "How to join queues",
          value:
            "**TEXT**: Click the button under a queue display or use `/join` & `/leave`.\n" +
            "**VOICE**: Join the matching voice channel.",
        },
        {
          name: "`/display`" + (alt ? " or `!display`" : ""),
          value: "Display a queue",
        },
        {
          name: "`/join`" + (alt ? " or `!join`" : ""),
          value: "Join a text queue / Update queue message after joining",
        },
        {
          name: "`/leave`" + (alt ? " or `!leave`" : ""),
          value: "Leave a queue",
        },
        {
          name: "`/myqueues`" + (alt ? " or `!myqueues`" : ""),
          value: "Show my queues",
        },
        {
          name: "`/help setup`" + (alt ? " or `!help setup`" : ""),
          value: "Setup & admin commands",
        },
      ],
    };
    await parsed
      .reply({
        embeds: [response],
        messageDisplay: "DM",
        commandDisplay: "EPHEMERAL",
      })
      .catch(() => null);
  }

  /**
   * Display help messages for queues
   */
  public static async helpQueue(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 10 });

    const response: MessageEmbedOptions = {
      author: { name: "Privileged Commands" },
      title: "Queue Management",
      fields: [
        {
          name: "`/autopull`",
          value: "Get / Set automatic pull from a voice queue",
        },
        {
          name: "`/blacklist add user` & `/blacklist add role`",
          value: "Blacklist a user or role",
        },
        {
          name: "`/blacklist delete user` & `/blacklist delete role`",
          value: "Un-blacklist a user or role",
        },
        {
          name: "`/blacklist list`",
          value: "Display a blacklist",
        },
        {
          name: "`/blacklist clear`",
          value: "Clear a blacklist",
        },
        {
          name: "`/button`",
          value: 'Get / Set whether a "Join / Leave" button appears under a text queue display',
        },
        {
          name: "`/clear`",
          value: "Clear a queue",
        },
        {
          name: "`/color`",
          value: "Get / Set color of queue displays",
        },
        {
          name: "`/enqueue user` & `/enqueue role`",
          value: "Add a specified user or role to a queue",
        },
        {
          name: "`/graceperiod`",
          value: "Get / Set how long users can leave a queue before losing their position",
        },
        {
          name: "`/header`",
          value: "Get / Set a header on display messages",
        },
        {
          name: "`/dequeue`",
          value: "Dequeue a user",
        },
        {
          name: "`/dequeue all`",
          value: "Dequeue a user from all queue",
        },
        {
          name: "`/lock`",
          value: "Lock or unlock a queue. Locked queues can still be left",
        },
        {
          name: "`/mentions`",
          value:
            "Get / Set whether users are displayed as mentions (on), or normal text (off). Normal text helps avoid the @invalid-user issue",
        },
        {
          name: "`/move`",
          value: "Move a user to a new position in a queue",
        },
        {
          name: "`/next`",
          value: "Pull from a text queue",
        },
        {
          name: "`/pullnum`",
          value: "Get / Set the default # of users to pull when autopull is off or when using `/next`",
        },
        {
          name: "`/queues add`",
          value: "Create a queue",
        },
        {
          name: "`/queues delete`",
          value: "Delete a queue",
        },
        {
          name: "`/queues list`",
          value: "List queues",
        },
        {
          name: "`/roles`",
          value: "Enable or disable whether members in a queue are given an `In Queue: ...` role",
        },
        {
          name: "`/scheduleclear`",
          value: "Clear queues on a schedule",
        },
        {
          name: "`/shuffle`",
          value: "Shuffle a queue",
        },
        {
          name: "`/size`",
          value: "Get / Set the size limits of queues",
        },
        {
          name: "`/timestamps`",
          value: "Display timestamps next to users",
        },
        {
          name: "`/to-me`",
          value: "Pull user(s) from a voice queue to you and display their name(s)",
        },
        {
          name: "`/whitelist add user` & `/whitelist add role`",
          value: "whitelist a user or role",
        },
        {
          name: "`/whitelist delete user` & `/whitelist delete role`",
          value: "Un-whitelist a user or role",
        },
        {
          name: "`/whitelist list`",
          value: "Display a whitelist",
        },
        {
          name: "`/whitelist clear`",
          value: "Clear a whitelist",
        },
      ],
    };
    const content = parsed.hasPermission
      ? "✅ You can use privileged commands."
      : "❌ You can **NOT** use privileged commands.";
    await parsed
      .reply({
        content: content,
        embeds: [response],
        messageDisplay: "DM",
        commandDisplay: "EPHEMERAL",
      })
      .catch(() => null);
  }

  /**
   * Display help messages for bot settings
   */
  public static async helpBot(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 8 });

    const response: MessageEmbedOptions = {
      author: { name: "Privileged Commands" },
      title: "Bot Management",
      fields: [
        {
          name: "`/altprefix`",
          value: "Enable or disable alternate prefix `!`",
        },
        {
          name: "`/mode`",
          value: "Set display mode",
        },
        {
          name: "`/notifications`",
          value: "Get / Set notification status (on = DM users when they are pulled out. off = no DMS)",
        },
        {
          name: "`/permission add user` & `/permission add role`",
          value: "Grant bot permission to a user or role",
        },
        {
          name: "`/permission delete user` & `/permission delete role`",
          value: "Revoke bot permission from a user or role",
        },
        {
          name: "`/permission list`",
          value: "List users & roles with bot permission",
        },
        {
          name: "`/permission clear`",
          value: "Clear users & roles with bot permission",
        },
        {
          name: "`/start`",
          value: "Add the bot to a voice queue",
        },
      ],
    };
    const content = parsed.hasPermission
      ? "✅ You can use privileged commands."
      : "❌ You can **NOT** use privileged commands.";
    await parsed
      .reply({
        content: content,
        embeds: [response],
        messageDisplay: "DM",
        commandDisplay: "EPHEMERAL",
      })
      .catch(() => null);
  }

  /**
   *
   */
  public static async helpSetup(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 10 });

    const response: MessageEmbedOptions = {
      author: { name: "Privileged Commands" },
      title: "Setup",
      description:
        "By default, privileged commands can only be used by the server owner, admins, and users with any " +
        "of the following roles: `mod`, `moderator`, `admin`, `administrator`. " +
        "Users or roles can be granted permission to use privileged commands with `/permission add`.",
      fields: [
        {
          name: "Step 1. Create a queue",
          value: "`/queues add`",
        },
        {
          name: "Step 2. Join queues",
          value:
            "**TEXT**: Click the button under a queue display or use `/join` & `/leave`.\n" +
            "**VOICE**: Join the matching voice channel.",
        },
        {
          name: "Step 3. Pull users from queues",
          value:
            "**TEXT**: Admins can pull users from text queues with `/next`.\n" +
            "**VOICE**: Pulling users from voice queues requires 2 steps:\n" +
            "1. `/start` makes the bot join a voice queue.\n" +
            "2. Drag the bot to a new (non-queue) voice channel, then disconnect the bot.\n" +
            "If the new channel has a user limit (`/size`), " +
            "the bot will automatically pull users from the queue to keep the new channel full.\n" +
            "If the new channel does not have a user limit, " +
            "drag the bot to a new (non-queue) voice channel, each time you want to pull " +
            "a user from the queue (the bot will swap with them). " +
            "You can customize how many users the bot will pull at a time with `/pullnum`.",
        },
        {
          name: "Step 4. Other Commands",
          value:
            "There are more commands for customizing bot behavior.\n" +
            "View the queue management commands with `/help queues`.\n" +
            "View the bot management commands with `/help bot`.",
        },
        {
          name: "Support Server",
          value: "[Support Server link](https://discord.com/invite/RbmfnP3)",
        },
        {
          name: "Support the Bot :heart:",
          value:
            "Hosting isn't free and development takes lots of time.\n" +
            "1. [Leave a review on top.gg](https://top.gg/bot/679018301543677959).\n" +
            "2. [Buy me a coffee](https://www.buymeacoffee.com/Arroww).",
        },
      ],
    };
    const content = parsed.hasPermission
      ? "✅ You can use privileged commands."
      : "❌ You can **NOT** use privileged commands.";
    await parsed
      .reply({
        content: content,
        embeds: [response],
        messageDisplay: "DM",
        commandDisplay: "EPHEMERAL",
      })
      .catch(() => null);
  }

  // --------------------------------- JOIN ------------------------------- //

  /**
   * Join a text queue / Update queue message after joining
   */
  public static async join(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 4, hasChannel: true })).length) return;

    const queueChannel = parsed.args.channel as GuildBasedChannel;
    const author = parsed.request.member as GuildMember;

    if (queueChannel.type !== "GUILD_TEXT") {
      if (author.voice?.channel?.id !== queueChannel.id) {
        await parsed
          .reply({
            content: `**ERROR**: \`/join ${queueChannel.name}\` can only be used while you are in the \`${queueChannel.name}\` voice channel.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
        return;
      }
    }

    const customMessage = parsed.args.text?.substring(0, 128);
    try {
      await QueueMemberTable.store(queueChannel, author, customMessage);
      await parsed
        .reply({
          content: `You joined \`${queueChannel.name}\`.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } catch (e: any) {
      if (e.author === "Queue Bot") {
        await parsed
          .reply({
            content: "**ERROR**: " + e.message,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
        return;
      }
    }
    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
  }

  // --------------------------------- DEQUEUE ------------------------------- //

  /**
   * HELPER
   */
  private static async dequeueFromQueue(
    queueGuild: QueueGuild,
    queueChannel: GuildBasedChannel,
    members: GuildMember[]
  ) {
    if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel.type)) {
      for await (const member of members) {
        await member?.voice?.disconnect().catch(() => null);
      }
    } else {
      await QueueMemberTable.unstore(
        queueGuild.guild_id,
        queueChannel.id,
        members.map((m) => m.id)
      );
    }
  }

  /**
   * Dequeue a user from a specified queue
   */
  public static async dequeue(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 4, hasChannel: true, hasMember: true })).length) return;

    const member = parsed.args.member;
    const channel = parsed.args.channel;
    await this.dequeueFromQueue(parsed.queueGuild, channel, [member]);
    MessagingUtils.updateDisplay(parsed.queueGuild, channel);
    await parsed
      .reply({
        content: `Dequeueed <@${member.id}> from \`${channel.name}\` queue.`,
      })
      .catch(() => null);
  }

  // --------------------------------- dequeue-all ------------------------------- //

  /**
   * Dequeue a user from all queues
   */
  public static async dequeueAll(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 7, hasMember: true })).length) return;

    const member = parsed.args.member;
    const channels: GuildBasedChannel[] = [];
    const storedChannelIds = (await QueueChannelTable.getFromGuild(member.guild.id)).map((ch) => ch.queue_channel_id);
    const storedEntries = await QueueMemberTable.getFromChannels(storedChannelIds, member.id);

    const promises = [];
    for (const entry of storedEntries) {
      promises.push(
        parsed
          .getChannels()
          .then((chs) => chs.find((ch) => ch.id === entry.channel_id))
          .then((ch) => {
            channels.push(ch);
            this.dequeueFromQueue(parsed.queueGuild, ch, [member]);
          })
      );
    }
    await Promise.all(promises);
    for (const channel of channels) {
      MessagingUtils.updateDisplay(parsed.queueGuild, channel);
    }
    await parsed
      .reply({
        content: `Dequeueed <@${member.id}> from ` + channels.map((ch) => `\`${ch.name}\``).join(", ") + " queues.",
      })
      .catch(() => null);
  }

  // --------------------------------- LEAVE ------------------------------- //

  /**
   * Leave a text queue
   */
  public static async leave(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 5, hasChannel: true })).length) return;

    const queueChannel = parsed.args.channel as GuildBasedChannel;
    const author = parsed.request.member as GuildMember;
    const storedMember = await QueueMemberTable.get(queueChannel.id, author.id);
    if (storedMember) {
      await QueueMemberTable.unstore(queueChannel.guild.id, queueChannel.id, [author.id]);
      await parsed
        .reply({
          content: `You left \`${queueChannel.name}\`.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      await parsed
        .reply({
          content: `You were not in \`${queueChannel.name}\`.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
  }

  // --------------------------------- LOCK ------------------------------- //

  public static async lockGet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 8, hasChannel: true })).length) return;

    const queueChannel = parsed.args.channel;
    const storedQueue = await QueueChannelTable.get(queueChannel.id).catch(() => null as QueueChannel);
    if (!storedQueue) return;

    await parsed
      .reply({
        content: `\`${queueChannel.name}\` is **${storedQueue.is_locked ? "locked" : "unlocked"}**.`,
      })
      .catch(() => null);
  }

  /**
   * the current mentions settings
   */
  public static async lockSet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 8, hasChannel: true, hasText: true })).length) return;

    const queueChannel = parsed.args.channel;
    const storedQueue = await QueueChannelTable.get(queueChannel.id).catch(() => null as QueueChannel);
    if (!storedQueue) return;

    if (!["lock", "unlock"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `lock` or `unlock`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else if (
      (storedQueue.is_locked && parsed.args.text === "lock") ||
      (!storedQueue.is_locked && parsed.args.text === "unlock")
    ) {
      await parsed
        .reply({
          content: `Queue was already ${parsed.args.text}ed.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      await QueueChannelTable.setLock(queueChannel.id, parsed.args.text === "lock");
      if (parsed.args.text === "unlock" && queueChannel.type === "GUILD_VOICE") {
        queueChannel.members.each((member) => QueueMemberTable.store(queueChannel, member));
      }
      await parsed
        .reply({
          content: `${parsed.args.text === "lock" ? "Locked " : "Unlocked "} \`${queueChannel.name}\`.`,
        })
        .catch(() => null);
      MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    }
  }

  // --------------------------------- MENTIONS ------------------------------- //

  /**
   * the current mentions settings
   */
  public static async mentionsGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 12 });

    await parsed
      .reply({
        content: "**Mentions**: " + (parsed.queueGuild.disable_mentions ? "off" : "on"),
      })
      .catch(() => null);
  }

  /**
   * Enable or disable mentions in queue displays
   */
  public static async mentionsSet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 12, hasText: true })).length) return;

    if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else if (
      (parsed.queueGuild.disable_mentions && parsed.args.text === "off") ||
      (!parsed.queueGuild.disable_mentions && parsed.args.text === "on")
    ) {
      await parsed
        .reply({
          content: `Mentions were already ${parsed.args.text}.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      const guild = parsed.request.guild;
      const disableMentions = parsed.args.text !== "on";
      await QueueGuildTable.setDisableMentions(guild.id, disableMentions);
      await parsed
        .reply({
          content: `Set mentions to \`${parsed.args.text}\`.`,
        })
        .catch(() => null);
      const storedQueues = await QueueChannelTable.getFromGuild(guild.id);
      const promises = [];
      for (const storedQueue of storedQueues) {
        promises.push(
          parsed
            .getChannels()
            .then((chs) => chs.find((ch) => ch.id === storedQueue.queue_channel_id))
            .then((ch) => MessagingUtils.updateDisplay(parsed.queueGuild, ch))
        );
      }
      await Promise.all(promises);
    }
  }

  // --------------------------------- MODE ------------------------------- //

  /**
   * the current autopull settings
   */
  public static async modeGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 8 });

    let response = "**Messaging Mode**:\n";
    switch (parsed.queueGuild.msg_mode) {
      case 1:
        response += "`1`. Old display messages are edited.";
        break;
      case 2:
        response += "`2`. New display messages are sent and old ones are deleted.";
        break;
      case 3:
        response += "`3`. New display messages are sent.";
        break;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Toggle automatic pull of users from a queue
   */
  public static async modeSet(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 8,
          hasNumber: { required: true, min: 1, max: 3, defaultValue: 1 },
        })
      ).length
    )
      return;

    if (![1, 2, 3].includes(parsed.args.num)) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `1`, `2`, or `3`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }

    await QueueGuildTable.setMessageMode(parsed.request.guild.id, parsed.args.num);
    await parsed
      .reply({
        content: `Set messaging mode to \`${parsed.args.num}\`.`,
      })
      .catch(() => null);
  }

  // --------------------------------- MOVE ------------------------------- //

  /**
   * Move a user to a new place in a queue
   */
  public static async move(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 4,
          hasChannel: true,
          hasMember: true,
          hasNumber: { required: true, min: 1, max: 9999, defaultValue: null },
        })
      ).length
    )
      return;

    const position = parsed.args.num;
    const member = parsed.args.member;
    const queueChannel = parsed.args.channel;
    if (!position || !member?.id || !queueChannel?.id) return;
    const storedMember = await QueueMemberTable.get(queueChannel.id, member.id);
    if (!storedMember) return;

    let queueMembers = await QueueMemberTable.getFromQueueOrdered(queueChannel);
    const memberPosition = queueMembers.map((m) => m.member_id).indexOf(member.id);
    const min = Math.min(position - 1, memberPosition);
    const max = Math.min(queueMembers.length, Math.max(position - 1, memberPosition));
    queueMembers = queueMembers.slice(min, max + 1);
    const queueMemberTimeStamps = queueMembers.map((member) => member.created_at);
    if (memberPosition > min) {
      queueMemberTimeStamps.push(queueMemberTimeStamps[0]);
      queueMemberTimeStamps.shift();
    } else {
      queueMemberTimeStamps.unshift(queueMemberTimeStamps[queueMembers.length - 1]);
    }
    const promises = [];
    for (let i = 0; i < queueMembers.length; i++) {
      promises.push(
        QueueMemberTable.setCreatedAt(queueChannel.id, queueMembers[i].member_id, queueMemberTimeStamps[i])
      );
    }
    await Promise.all(promises);

    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    await parsed
      .reply({
        content: `Moved <@${member.id}> to position **${position}** of \`${queueChannel.name}\`.`,
      })
      .catch(() => null);
  }

  // --------------------------------- MYQUEUES ------------------------------- //

  /**
   * Display the queues you are in with your position
   */
  public static async myQueues(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 8 });

    const author = parsed.request.member as GuildMember;
    const storedChannelIds = (await QueueChannelTable.getFromGuild(author.guild.id)).map((ch) => ch.queue_channel_id);
    const storedEntries = (await QueueMemberTable.getFromChannels(storedChannelIds, author.id)).slice(0, 25);
    if (storedEntries?.length < 1) {
      await parsed
        .reply({
          content: `You are in no queues.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      const embed = new MessageEmbed();
      embed.setTitle(`${author.displayName}'s queues`);
      for await (const entry of storedEntries) {
        const queueChannel = (await parsed.getChannels()).find((ch) => ch.id === entry.channel_id);
        if (!queueChannel) continue;
        const memberIds = (await QueueMemberTable.getFromQueueOrdered(queueChannel)).map((member) => member.member_id);
        embed.addField(
          queueChannel.name,
          `${memberIds.indexOf(author.id) + 1} <@${author.id}>` +
            (entry.personal_message ? ` -- ${entry.personal_message}` : "")
        );
      }
      await parsed
        .reply({
          embeds: [embed],
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- NEXT ------------------------------- //

  /**
   * Pull user(s) from a queue and display their name(s)
   */
  public static async next(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 4,
          hasChannel: true,
          hasNumber: { required: false, min: 1, max: 99, defaultValue: null },
        })
      ).length
    )
      return;

    const queueChannel = parsed.args.channel;
    const storedQueue = parsed.storedQueues.find((ch) => ch.queue_channel_id === queueChannel.id);
    if (!storedQueue) return;

    const targetChannel = queueChannel.guild.channels.cache.get(storedQueue.target_channel_id) as
      | VoiceChannel
      | StageChannel;

    await this.pullMembers(parsed, targetChannel);
  }

  private static async pullMembers(parsed: Parsed, targetChannel: VoiceChannel | StageChannel) {
    const queueChannel = parsed.args.channel;
    const storedQueue = parsed.storedQueues.find((ch) => ch.queue_channel_id === queueChannel.id);
    if (!storedQueue) return;

    try {
      await parsed.deferReply();
    } catch (e: any) {
      return;
    }

    // Get the oldest member entries for the queue
    const amount = parsed.args.num || storedQueue.pull_num || 1;
    let queueMembers = await QueueMemberTable.getFromQueueOrdered(queueChannel, amount);

    if (queueMembers.length > 0) {
      // Check enable_partial_pull
      if (!storedQueue.enable_partial_pull && queueMembers.length < amount) {
        await parsed
          .edit({
            content:
              `\`${queueChannel.name}\` only has **${queueMembers.length}** member${queueMembers.length > 1 ? "s" : ""}, **${amount}** are needed. ` +
              `To allow pulling of fewer than **${amount}** member${queueMembers.length > 1 ? "s" : ""}, use \`/pullnum\` and enable \`partial_pulling\`.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
        return;
      }
      // Display and remove member from the queue
      if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel.type)) {
        if (targetChannel) {
          const promises = [];
          for (const queueMember of queueMembers) {
            promises.push(
              QueueMemberTable.getMemberFromQueueMember(queueChannel, queueMember)
                .then((m) => m.voice.setChannel(targetChannel))
                .catch(() => null)
            );
          }
          await Promise.all(promises);
        } else {
          await parsed
            .edit({
              content:
                "**ERROR**: No target channel. Set a target channel by sending `/start` then dragging the bot to the target channel.",
              commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
          return;
        }
      } else {
        const promises = [];
        for (const queueMember of queueMembers) {
          promises.push(
            QueueMemberTable.getMemberFromQueueMember(queueChannel, queueMember).then((member) => {
              if (member && !parsed.queueGuild.disable_notifications) {
                member
                  .send(
                    `You were just pulled from the \`${queueChannel.name}\` queue ` +
                      `in \`${queueChannel.guild.name}\`. Thanks for waiting!`
                  )
                  .catch(() => null);
              }
            })
          );
        }
        await Promise.all(promises);
      }
      await parsed
        .edit({
          content:
            `Pulled ` +
            queueMembers.map((member) => `<@${member.member_id}>`).join(", ") +
            ` from \`${queueChannel.name}\`.`,
        })
        .catch(() => null);
      await QueueMemberTable.unstore(
        queueChannel.guild.id,
        queueChannel.id,
        queueMembers.map((member) => member.member_id)
      );
      MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    } else {
      await parsed
        .edit({
          content: `\`${queueChannel.name}\` is empty.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- NOTIFICATIONS ------------------------------- //

  public static async notificationsGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 17 });
    await parsed
      .reply({
        content: "**Notifications**: " + (parsed.queueGuild.disable_notifications ? "off" : "on"),
      })
      .catch(() => null);
  }

  public static async notificationsSet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 17, hasText: true })).length) return;

    if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else if (
      (parsed.queueGuild.disable_notifications && parsed.args.text === "off") ||
      (!parsed.queueGuild.disable_notifications && parsed.args.text === "on")
    ) {
      await parsed
        .reply({
          content: `Notifications were already ${parsed.args.text}.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      await QueueGuildTable.setDisableNotifications(parsed.request.guild.id, parsed.args.text === "off");
      await parsed
        .reply({
          content: `Notifications have been turned **${parsed.args.text}**.`,
        })
        .catch(() => null);
    }
  }

  // --------------------------------- PERMISSIONS ------------------------------- //

  /**
   * HELPER
   */
  private static async genPermissionList(parsed: Parsed) {
    const perms = await AdminPermissionTable.getMany(parsed.request.guild.id);
    let response = "\nRoles and users with bot permission: ";
    if (perms?.length) {
      response += perms.map((status) => "<@" + (status.is_role ? "&" : "") + status.role_member_id + ">").join(", ");
    } else {
      response += "Empty";
    }
    return response;
  }

  /**
   * HELPER
   */
  private static async permissionAdd(parsed: Parsed) {
    const member = parsed.args.member;
    const role = parsed.args.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    let response = "";

    if (await AdminPermissionTable.get(parsed.request.guild.id, id)) {
      response += `\`${name}\` already has bot permission.`;
    } else {
      await AdminPermissionTable.store(parsed.request.guild.id, id, role != null);
      response += `Added bot permission for \`${name}\`.`;
    }
    response += await this.genPermissionList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Grant permission to a user to use bot commands
   */
  public static async permissionAddUser(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 19, hasMember: true })).length) return;

    await this.permissionAdd(parsed);
  }

  /**
   * Grant permission to a role to use bot commands
   */
  public static async permissionAddRole(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 19, hasRole: true })).length) return;

    await this.permissionAdd(parsed);
  }

  /**
   * HELPER
   */
  private static async permissionDelete(parsed: Parsed) {
    const member = parsed.args.member;
    const role = parsed.args.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    let response = "";

    if (await AdminPermissionTable.get(parsed.request.guild.id, id)) {
      await AdminPermissionTable.unstore(parsed.request.guild.id, id);
      response += `Removed bot permission for \`${name}\`.`;
    } else {
      response += `\`${name}\` did not have bot permission.`;
    }
    response += await this.genPermissionList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Revoke permission from a user to use bot commands
   */
  public static async permissionDeleteUser(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 22, hasMember: true })).length) return;

    await this.permissionDelete(parsed);
  }

  /**
   * Revoke permission from a role to use bot commands
   */
  public static async permissionDeleteRole(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 22, hasRole: true })).length) return;

    await this.permissionDelete(parsed);
  }

  /**
   * List roles and users with permission
   */
  public static async permissionList(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 20 });

    const response = await this.genPermissionList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Clear roles and users with permission
   */
  public static async permissionClear(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 21 })).length) return;

    await AdminPermissionTable.unstore(parsed.request.guildId);
    await parsed
      .reply({
        content: `Cleared the bot permissions list.`,
      })
      .catch(() => null);
  }

  // --------------------------------- PRIORITY ------------------------------- //

  /**
   * HELPER
   */
  private static async validatePriorityList(parsed: Parsed, storedEntries: PriorityEntry[]) {
    let removedAny = false;
    const promises = [];
    for (const entry of storedEntries) {
      promises.push(
        (entry.is_role ? parsed.request.guild.roles : parsed.request.guild.members)
          .fetch(entry.role_member_id)
          .catch((e) => {
            if ([403, 404].includes(e.httpStatus)) {
              PriorityTable.unstore(parsed.queueGuild.guild_id, entry.role_member_id);
              removedAny = true;
            }
          })
      );
    }
    await Promise.all(promises);
    if (removedAny) {
      setTimeout(
        async () =>
          await parsed
            .reply({
              content: `Removed 1 or more invalid members/roles from the priority list.`,
            })
            .catch(() => null),
        1000
      );
    }
  }

  /**
   * HELPER
   */
  private static async genPriorityList(parsed: Parsed): Promise<string> {
    const storedEntries = await PriorityTable.getMany(parsed.queueGuild.guild_id);
    this.validatePriorityList(parsed, storedEntries).then();
    let response = "\nPriority list: ";
    if (storedEntries?.length) {
      response += storedEntries
        .map((entry) => "<@" + (entry.is_role ? "&" : "") + entry.role_member_id + ">")
        .join(", ");
    } else {
      response += "Empty";
    }
    return response;
  }

  /**
   * HELPER. Re-evaluate all. This can be slow
   */
  private static async updatePriorities(parsed: Parsed) {
    const guild = parsed.request.guild;
    // Get all priority Ids for guild
    const priorityIds = (await PriorityTable.getMany(guild.id)).map((entry) => entry.role_member_id);
    // Get all queue channels for guild
    for await (const storedChannel of await parsed.getStoredQueues()) {
      const queueChannel = (await parsed.getChannels()).find((ch) => ch.id === storedChannel.queue_channel_id);
      if (!queueChannel) continue;
      // Get members for each queue channel
      const storedMembers = await QueueMemberTable.getFromQueueUnordered(queueChannel);
      for await (const storedMember of storedMembers) {
        const queueMember = await QueueMemberTable.getMemberFromQueueMember(queueChannel, storedMember);
        if (!queueMember) continue;
        // Re-evaluate priority for each member
        const roleIds = queueMember.roles.cache.keys();
        if ([queueMember.id, ...roleIds].some((id) => priorityIds.includes(id))) {
          QueueMemberTable.setPriority(queueChannel.id, queueMember.id, true).then();
        } else {
          QueueMemberTable.setPriority(queueChannel.id, queueMember.id, false).then();
        }
      }
      // Schedule display update for each queue
      MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    }
  }

  /**
   * HELPER
   */
  private static async priorityAdd(parsed: Parsed) {
    const member = parsed.args.member;
    const role = parsed.args.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    const guildId = parsed.request.guild.id;
    let response = "";

    if (await PriorityTable.get(guildId, id)) {
      response += `\`${name}\` is already on the priority list.`;
    } else {
      await PriorityTable.store(guildId, id, role != null);
      response += `Added \`${name}\` to the priority list.`;
      this.updatePriorities(parsed).then();
    }

    response += await this.genPriorityList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Grant priority in queue to a user
   */
  public static async priorityAddUser(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 17, hasMember: true })).length) return;

    await this.priorityAdd(parsed);
  }

  /**
   * Grant priority in queue to a role
   */
  public static async priorityAddRole(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 17, hasRole: true })).length) return;

    await this.priorityAdd(parsed);
  }

  /**
   * HELPER
   */
  private static async priorityDelete(parsed: Parsed) {
    const member = parsed.args.member;
    const role = parsed.args.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    const guildId = parsed.request.guild.id;
    let response = "";

    if (await PriorityTable.get(guildId, id)) {
      await PriorityTable.unstore(guildId, id);
      response += `Removed \`${name}\` from the priority list.`;
      this.updatePriorities(parsed).then();
    } else {
      response += `\`${name}\` was not on the priority list.`;
    }

    response += await this.genPriorityList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Revoke priority in queue from a user
   */
  public static async priorityDeleteUser(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 17, hasMember: true })).length) return;

    await this.priorityDelete(parsed);
  }

  /**
   * Revoke priority in queue from a role
   */
  public static async priorityDeleteRole(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 17, hasRole: true })).length) return;

    await this.priorityDelete(parsed);
  }

  /**
   * List roles and users with priority in queue
   */
  public static async priorityList(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 13 });

    const response = await this.genPriorityList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Clear roles and users with permission
   */
  public static async priorityClear(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 22 })).length) return;

    await PriorityTable.unstore(parsed.request.guildId);
    await parsed
      .reply({
        content: `Cleared the priority list.`,
      })
      .catch(() => null);
  }

  // --------------------------------- PULLNUM ------------------------------- //

  /**
   * the current pullnum settings
   */
  public static async pullnumGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 11 });

    let response = "**Pull nums**:\n";
    for await (const storedQueue of await parsed.getStoredQueues()) {
      const queueChannel = parsed.request.guild.channels.cache.get(storedQueue.queue_channel_id);
      if (!queueChannel) continue;
      response += `\`${queueChannel.name}\`: ${storedQueue.pull_num}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set the default # of users to pull when autopull is off or when using the `next` command
   */
  public static async pullnumSet(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 11,
          hasChannel: true,
          hasNumber: { required: true, min: 1, max: 99, defaultValue: 1 },
          hasText: true,
        })
      ).length
    )
      return;

    if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      const queueChannel = parsed.args.channel;
      const num = parsed.args.num;
      const enable_partial_pulling = "on" === parsed.args.text.toLowerCase();
      await QueueChannelTable.setPullnum(queueChannel.id, num, enable_partial_pulling);
      await parsed
        .reply({
          content: `Set pull number of \`${queueChannel.name}\` to \`${num}\`.`,
        })
        .catch(() => null);
      MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    }
  }

  // --------------------------------- QUEUES ------------------------------- //

  /**
   * HELPER
   */
  private static async genQueuesList(parsed: Parsed): Promise<string> {
    const storedChannels = await QueueChannelTable.fetchFromGuild(parsed.request.guild);
    if (storedChannels.size) {
      return "\nQueues: " + storedChannels.map((ch) => `\`${ch.name}\``).join(", ");
    } else {
      return "\nNo queue channels set. Set a new queue channel using `/queues add`.";
    }
  }

  /**
   * HELPER
   */
  private static async storeQueue(parsed: Parsed, channel: GuildBasedChannel, size: number) {
    await QueueChannelTable.store(parsed, channel, size);
    await parsed
      .reply({
        content: `Created \`${channel.name}\` queue.` + (await this.genQueuesList(parsed)),
      })
      .catch(() => null);

    await this.display(parsed, channel);
  }

  /**
   * Add a new queue
   */
  public static async queuesAdd(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 10,
          hasChannel: true,
          hasNumber: { required: false, min: 1, max: 99, defaultValue: null },
        })
      ).length
    )
      return;

    const channel = parsed.args.channel;
    const storedChannels = await QueueChannelTable.fetchFromGuild(parsed.request.guild);

    if (storedChannels.some((stored) => stored.id === channel.id)) {
      await parsed
        .reply({
          content: `\`${channel.name}\` is already a queue.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      const channelLim = (channel as VoiceChannel | StageChannel).userLimit;
      let size = parsed.args.num;
      if (!size && channelLim) size = channelLim;
      if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(channel.type)) {
        if (channel.permissionsFor(parsed.request.guild.me).has("CONNECT")) {
          await this.storeQueue(parsed, channel, size);
          if (size && channel.type === "GUILD_VOICE") {
            if (channel.permissionsFor(parsed.request.guild.me).has("MANAGE_CHANNELS")) {
              await channel.setUserLimit(size).catch(() => null);
            } else {
              setTimeout(
                async () =>
                  await parsed
                    .reply({
                      content:
                        "I can automatically set voice channel user limits, but I need a new permission:\n" +
                        "`Server Settings` > `Roles` > `Queue Bot` > `Permissions` tab > enable `Manage Channels`.\n" +
                        "If that does not work, check the channel-specific permissions.",
                      commandDisplay: "EPHEMERAL",
                    })
                    .catch(() => null),
                1000
              );
            }
          }
        } else {
          await parsed
            .reply({
              content: `**ERROR**: I need the **CONNECT** permission in the \`${channel.name}\` voice channel to pull in queue members.`,
              commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
        }
      } else {
        await this.storeQueue(parsed, channel, size);
      }
    }
  }

  /**
   * Delete a queue
   */
  public static async queuesDelete(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 13, hasChannel: true })).length) return;

    const queueChannel = parsed.args.channel;
    const storedQueue = await QueueChannelTable.get(queueChannel.id);
    if (storedQueue) {
      await QueueChannelTable.unstore(parsed.request.guild.id, queueChannel.id, parsed);
      const response = `Deleted queue for \`${queueChannel.name}\`.` + (await this.genQueuesList(parsed));
      await parsed
        .reply({
          content: response,
        })
        .catch(() => null);
      Voice.disconnectFromChannel(queueChannel as VoiceChannel | StageChannel);
    } else {
      const response = `\`${queueChannel.name}\` is not a queue.` + (await this.genQueuesList(parsed));
      await parsed
        .reply({
          content: response,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  /**
   * List queues
   */
  public static async queuesList(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 11 });

    const response = await this.genQueuesList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- ROLES ------------------------------- //

  /**
   * the current autopull settings
   */
  public static async rolesGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 9 });
    await parsed
      .reply({
        content: "**Queue Roles**: " + (parsed.queueGuild.disable_roles ? "off" : "on"),
      })
      .catch(() => null);
  }

  /**
   * Enable or disable alternate prefix
   */
  public static async rolesSet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 9, hasText: true })).length) return;

    if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
    if (
      (parsed.queueGuild.disable_roles && parsed.args.text === "off") ||
      (!parsed.queueGuild.disable_roles && parsed.args.text === "on")
    ) {
      await parsed
        .reply({
          content: `Roles were already ${parsed.args.text}.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      const guild = parsed.request.guild;
      const disableRoles = parsed.args.text === "off";
      await QueueGuildTable.setDisableRoles(guild.id, disableRoles);
      await parsed.reply({ content: `Set roles to \`${parsed.args.text}\`.` }).catch(() => null);

      const storedQueues = await QueueChannelTable.getFromGuild(guild.id);
      for await (const storedQueue of storedQueues) {
        const channel = (await parsed.getChannels()).find((ch) => ch.id === storedQueue.queue_channel_id);
        if (!channel) continue;
        if (disableRoles) {
          // Delete role
          const role = await guild.roles.fetch(storedQueue.role_id).catch(() => null as Role);
          if (role) {
            await QueueChannelTable.deleteRoleId(channel).catch(() => null);
            await role.delete().catch(() => null);
          }
        } else {
          // Create role and assign it to members
          const role = await QueueChannelTable.createQueueRole(parsed, channel, storedQueue.color);
          if (role) {
            const queueMembers = await QueueMemberTable.getFromQueueUnordered(channel);
            for await (const queueMember of queueMembers) {
              await guild.members.fetch(queueMember.member_id).then((member) => member.roles.add(role));
            }
          } else {
            break; // Failed to create role, don't attempt to create the others
          }
        }
      }
    }
  }

  // --------------------------------- SCHEDULE CLEAR  ------------------------------- //

  /**
   * Get queue clearing schedules
   */
  public static async scheduleClearGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 17 });

    const storedQueues = await QueueChannelTable.getFromGuild(parsed.request.guildId);

    if (storedQueues?.length) {
      let resp = "";
      for (const storedQueue of storedQueues) {
        if (storedQueue.clear_schedule != null) {
          const queue = parsed.request.guild.channels.cache.get(storedQueue.queue_channel_id);
          const timezone = Base.getTimezone(+storedQueue.clear_utc_offset).value;
          resp += `Clearing \`${queue.name}\` **${cronstrue.toString(storedQueue.clear_schedule)}** ${timezone}.\n`;
        }
      }
      await parsed
        .reply({
          content: `**Scheduled Clears**:\n` + resp,
        })
        .catch(() => null);
    } else {
      await parsed
        .reply({
          content: `No scheduled clears.`,
        })
        .catch(() => null);
    }
  }

  /**
   * Help with writing clear schedules
   */
  public static async scheduleClearHelp(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 18 });
    await parsed
      .reply({
        content:
          "`schedule` should be written in cron format (* * * * *). https://crontab.guru/examples.html has many examples and a tool for creating a custom schedule.\n\n" +
          "`utc-offset` is used as a timezone approximation. https://www.timeanddate.com/time/map/ is an easy way to find your offset (# on the bottom of the map). " +
          "There is no way to pick between Standard and Daylight time, the bot will tell you which timezone is used.\n\n" +
          "**Example**\n" +
          "Clear a queue every day at 2am in the Eastern Time timezone.\n" +
          "`/scheduleclear set` `queue` `0 2 * * *` `-6`",
        commandDisplay: "EPHEMERAL",
      })
      .catch(() => null);
  }

  /**
   * Set a queue clearing schedule
   */
  public static async scheduleClearSet(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 17,
          hasChannel: true,
          hasText: true,
          hasNumber: {
            min: -11,
            max: 12,
            defaultValue: null,
          },
        })
      ).length
    )
      return;

    const queueChannel = parsed.args.channel;
    let schedule = parsed.args.text;
    const utcOffset = parsed.args.num;

    // Validate schedule
    if (!cronValidate(schedule)) {
      await parsed
        .reply({
          content: `Invalid cron schedule. Please see https://crontab.guru/examples.html.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }

    // Remove seconds argument from cron schedule
    const scheduleSplit = schedule.split(" ");
    if (scheduleSplit.length > 5) {
      schedule = scheduleSplit.slice(1).join(" ");
    }

    // Turn UTC Offset into utcTime
    const timezone = Base.getTimezone(utcOffset).timezone;

    // Add node-cron
    cronSchedule(
      schedule,
      async () => {
        await QueueMemberTable.unstore(queueChannel.guild.id, queueChannel.id);
        MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
      },
      {
        timezone: timezone,
      }
    );

    // Store - stored entries are fed into node-cron at startup
    await QueueChannelTable.setScheduledClear(queueChannel.id, schedule, utcOffset);

    await parsed
      .reply({
        content: `Scheduled \`${queueChannel.name}\` to be cleared **${cronstrue.toString(schedule)}** ${timezone}.`,
      })
      .catch(() => null);
  }

  /**
   * Stop a queue clearing schedule
   */
  public static async scheduleClearStop(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 18, hasChannel: true });
    const queueChannel = parsed.args.channel;

    await QueueChannelTable.setScheduledClear(queueChannel.id, null, null);
    await parsed
      .reply({
        content: `Deleted the clearing schedule for \`${queueChannel.name}\`.`,
      })
      .catch(() => null);
  }

  // --------------------------------- SHUFFLE ------------------------------- //

  /**
   * Shuffle a queue
   */
  public static async shuffle(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 7, hasChannel: true })).length) return;

    const queueChannel = parsed.args.channel;
    const queueMembers = await QueueMemberTable.getFromQueueUnordered(queueChannel);
    const queueMemberTimeStamps = queueMembers.map((member) => member.created_at);
    Base.shuffle(queueMemberTimeStamps);
    for (let i = 0; i < queueMembers.length; i++) {
      await QueueMemberTable.setCreatedAt(queueChannel.id, queueMembers[i].member_id, queueMemberTimeStamps[i]);
    }
    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    await parsed
      .reply({
        content: `\`${queueChannel.name}\` queue shuffled.`,
      })
      .catch(() => null);
  }

  // --------------------------------- SIZE ------------------------------- //

  /**
   * the current queue sizes
   */
  public static async sizeGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 8 });

    let response = "**Sizes**:\n";
    for await (const storedQueue of await parsed.getStoredQueues()) {
      const queueChannel = parsed.request.guild.channels.cache.get(storedQueue.queue_channel_id);
      if (!queueChannel) continue;
      response += `\`${queueChannel.name}\`: ${storedQueue.max_members || "none"}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set the size of a queue
   */
  public static async sizeSet(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 8,
          hasChannel: true,
          hasNumber: { required: true, min: 1, max: 99, defaultValue: null },
        })
      ).length
    )
      return;

    const queueChannel = parsed.args.channel;
    let max = parsed.args.num;

    MessagingUtils.updateDisplay(parsed.queueGuild, queueChannel);
    await QueueChannelTable.setMaxMembers(queueChannel.id, max);
    await parsed
      .reply({
        content: `Set \`${queueChannel.name}\` size to \`${max ? max : "unlimited"}\` users.`,
      })
      .catch(() => null);
    if (queueChannel.type === "GUILD_VOICE") {
      if (queueChannel.permissionsFor(parsed.request.guild.me).has("MANAGE_CHANNELS")) {
        queueChannel.setUserLimit(max).catch(() => null);
      } else {
        await parsed
          .reply({
            content:
              "I can automatically change the user limit of voice channels, but I need a new permission:\n" +
              "`Server Settings` > `Roles` > `Queue Bot` > `Permissions` tab > enable `Manage Channels`.\n" +
              "If that doesn't work, check the channel-specific permissions.",
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
      }
    }
  }

  // --------------------------------- START ------------------------------- //

  /**
   * Add the bot to a voice queue
   */
  public static async start(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 5,
          hasChannel: true,
          channelType: ["GUILD_VOICE", "GUILD_STAGE_VOICE"],
        })
      ).length
    )
      return;

    const queueChannel = parsed.args.channel as VoiceChannel | StageChannel;

    if (queueChannel.permissionsFor(parsed.request.guild.me).has("CONNECT")) {
      if (!queueChannel.full) {
        await Voice.connectToChannel(queueChannel).catch(() => null);
        await parsed
          .reply({
            content: "Started.",
          })
          .catch(() => null);
      } else {
        await parsed
          .reply({
            content: `**ERROR**: I can't join \`${queueChannel.name}\` because it is full.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
      }
    } else {
      await parsed
        .reply({
          content: `**ERROR**: I don't have permission to join ${queueChannel.name}.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- TIMESTAMPS ------------------------------- //

  /**
   * Get the timestamps settings
   */
  public static async timestampsGet(parsed: Parsed) {
    await parsed.readArgs({ commandNameLength: 14 });

    await parsed
      .reply({
        content: "**Timestamps**: " + parsed.queueGuild.timestamps,
      })
      .catch(() => null);
  }

  /**
   * Enable or disable a joined-at timestamps next to each user in queue
   */
  public static async timestampsSet(parsed: Parsed) {
    if ((await parsed.readArgs({ commandNameLength: 14, hasText: true })).length) return;

    if (!["date", "time", "date+time", "relative", "off"].includes(parsed.args.text.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: **date**, **time**, **date+time**, **relative**, **off**.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else if (parsed.queueGuild.timestamps === parsed.args.text) {
      await parsed
        .reply({
          content: `Timestamps were already set to **${parsed.args.text}**.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      await QueueGuildTable.setTimestamps(parsed.request.guild.id, parsed.args.text);
      await parsed
        .reply({
          content: `Timestamps have been set to **${parsed.args.text}**.`,
        })
        .catch(() => null);
      // Update displays
      const channelIds = (await QueueChannelTable.getFromGuild(parsed.queueGuild.guild_id)).map(
        (c) => c.queue_channel_id
      );
      for (const chId of channelIds) {
        const channel = parsed.request.guild.channels.cache.find((ch) => ch.id === chId);
        MessagingUtils.updateDisplay(parsed.queueGuild, channel);
      }
    }
  }

  // --------------------------------- TO-ME ------------------------------- //

  /**
   * Pull user(s) from a queue and display their name(s)
   */
  public static async toMe(parsed: Parsed) {
    if (
      (
        await parsed.readArgs({
          commandNameLength: 5,
          hasChannel: true,
          channelType: ["GUILD_VOICE"],
          hasNumber: { required: false, min: 1, max: 99, defaultValue: null },
        })
      ).length
    )
      return;

    const targetChannel = (parsed.request.member as GuildMember).voice.channel;
    if (!targetChannel) {
      await parsed
        .reply({
          content: "**ERROR**: You must be in a voice channel to use `/to-me`",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }

    await this.pullMembers(parsed, targetChannel);
  }
}
