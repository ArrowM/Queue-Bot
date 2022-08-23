import { DiscordGatewayAdapterCreator, entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";
import cronstrue from "cronstrue";
import {
  GuildBasedChannel,
  GuildMember,
  MessageEmbed,
  MessageEmbedOptions,
  Role,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import { validate as cronValidate } from "node-cron";

import { Base } from "./utilities/Base";
import {
  BlackWhiteListEntry,
  Parsed,
  PriorityEntry,
  QueuePair,
  ReplaceWith,
  RequiredType,
  ScheduleCommand,
  StoredGuild,
  StoredQueue,
} from "./utilities/Interfaces";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { SchedulingUtils } from "./utilities/SchedulingUtils";
import { AdminPermissionTable } from "./utilities/tables/AdminPermissionTable";
import { BlackWhiteListTable } from "./utilities/tables/BlackWhiteListTable";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { PriorityTable } from "./utilities/tables/PriorityTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { QueueTable } from "./utilities/tables/QueueTable";
import { ScheduleTable } from "./utilities/tables/ScheduleTable";
import { Validator } from "./utilities/Validator";

export class Commands {
  /**
   * Apply function to 1 queue if specified, otherwise apply to all queues
   * @param parsed
   * @param func - function to apply
   * @param values - array of values, ReplaceWith get replaced with queue objects
   * @param printName
   * @param printValue
   * @private
   */
  private static async applyToQueue(
    parsed: Parsed,
    func: (..._: any[]) => Promise<void>,
    values?: any[],
    printName?: string,
    printValue?: string
  ) {
    const dataPromises = [];
    const displayPromises = [];
    for (const queue of parsed.args.channels) {
      let storedQueue: StoredQueue;
      if (values.includes(ReplaceWith.STORED_QUEUE)) {
        storedQueue = await QueueTable.get(queue.id);
      }
      dataPromises.push(
        func(
          ...values.map((val) => {
            switch (val) {
              case ReplaceWith.QUEUE_CHANNEL_ID:
                return queue.id;
              case ReplaceWith.QUEUE_CHANNEL:
                return queue;
              case ReplaceWith.STORED_QUEUE:
                return storedQueue;
              default:
                return val;
            }
          })
        )
      );
      displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
    }
    await Promise.all(dataPromises);
    await Promise.all(displayPromises);
    if (printName) {
      let response: string;
      if (parsed.args.channels) {
        response = `Set ${printName} of ${parsed.channelNames} to \`${printValue || parsed.string}\`.`;
      } else {
        response = `Set ${printName} of all queues to \`${printValue || parsed.string}\`.`;
      }
      await parsed.reply({ content: response }).catch(() => null);
    }
  }

  // --------------------------------- ENABLE PREFIX ------------------------------- //

  /**
   * the current alternate settings
   */
  public static async altPrefixGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "altprefix get" });
    await parsed
      .reply({
        content: "**Alt Prefix** (`!`): " + (parsed.storedGuild.enable_alt_prefix ? "on" : "off"),
      })
      .catch(() => null);
  }

  /**
   * Enable or disable alternate prefix
   */
  public static async altPrefixSet(parsed: Parsed) {
    if ((await parsed.parseArgs({ command: "altprefix set", strings: RequiredType.REQUIRED })).length) {
      return;
    }

    if (["on", "off"].includes(parsed.string.toLowerCase())) {
      if (
        (parsed.storedGuild.enable_alt_prefix && parsed.string === "on") ||
        (!parsed.storedGuild.enable_alt_prefix && parsed.string === "off")
      ) {
        await parsed
          .reply({
            content: `Alternative prefixes were already ${parsed.string}.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
      } else {
        await QueueGuildTable.setAltPrefix(parsed.request.guildId, parsed.string === "on");
        const response = `Alternative prefixes have been turned **${parsed.string}**.`;
        await parsed.reply({ content: response }).catch(() => null);
      }
    } else {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- AUTOPULL ------------------------------- //

  /**
   * the current autopull settings
   */
  public static async autopullGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "autopull get" });

    let response = "**Autopull**:\n";
    for await (const queue of await parsed.getQueuePairs()) {
      if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queue.channel?.type)) {
        response += `${queue.channel}: ${queue.stored.auto_fill ? "on" : "off"}\n`;
      } else {
        response += `${queue.channel}: no autopull for text\n`;
      }
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Toggle automatic pull of users from a queue
   */
  public static async autopullSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "autopull set",
          channel: {
            required: RequiredType.OPTIONAL,
            type: ["GUILD_VOICE", "GUILD_STAGE_VOICE"],
          },
          strings: RequiredType.REQUIRED,
        })
      ).length
    ) {
      return;
    }

    if (["on", "off"].includes(parsed.string.toLowerCase())) {
      await this.applyToQueue(parsed, QueueTable.setAutopull, [ReplaceWith.QUEUE_CHANNEL_ID, parsed.string === "on"], "autopull");
    } else {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
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
        (entry.is_role ? parsed.request.guild.roles : parsed.request.guild.members).fetch(entry.role_member_id).catch((e) => {
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
    let response = `\n**${type ? "White" : "Black"}lists**:`;

    for await (const queue of await parsed.getQueuePairs()) {
      const storedEntries = await BlackWhiteListTable.getMany(type, queue.channel.id);
      this.validateBWList(parsed, type, storedEntries).catch(() => null);

      response += `\n${queue.channel}: `;
      if (storedEntries?.length) {
        response += storedEntries.map((entry) => "<@" + (entry.is_role ? "&" : "") + entry.role_member_id + ">").join(", ");
      } else {
        response += "Empty";
      }
    }
    return response;
  }

  /**
   * Add a user or role to blacklist or whitelist
   */
  public static async bwAdd(parsed: Parsed, isRole: boolean, isBlacklist: boolean) {
    if (
      (
        await parsed.parseArgs({
          command: isBlacklist ? "blacklist add" : "whitelist add",
          channel: { required: RequiredType.OPTIONAL },
          roles: isRole ? RequiredType.REQUIRED : undefined,
          members: isRole ? undefined : RequiredType.REQUIRED,
        })
      ).length
    ) {
      return;
    }
    const type = isBlacklist ? 0 : 1;
    const member = parsed.member;
    const role = parsed.role;
    const id = member?.id || role?.id;
    if (!id) {
      return;
    }
    const name = member?.displayName || role?.name;
    const typeString = type ? "white" : "black";
    let response = "";

    const dataPromises = [];
    const displayPromises = [];
    for await (const queue of parsed.args.channels) {
      if (await BlackWhiteListTable.get(type, queue.id, id)) {
        response += `\`${name}\` is already on the ${typeString}list of \`${queue.name}\`.\n`;
      } else {
        if (typeString === "black") {
          const members = role ? [...role.members.values()] : [member];
          await this.dequeueFromQueue(parsed.storedGuild, queue, members);
        }
        response += `Added \`${name}\` to the ${typeString}list of \`${queue.name}\`.\n`;
        dataPromises.push(BlackWhiteListTable.store(type, queue.id, id, role != null));
        displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
      }
    }
    await Promise.all(dataPromises);
    await Promise.all(displayPromises);

    response += await this.genBWList(parsed, type);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Remove a user or role from blacklist or whitelist
   */
  public static async bwDelete(parsed: Parsed, isRole: boolean, isBlacklist: boolean) {
    if (
      (
        await parsed.parseArgs({
          command: isBlacklist ? "blacklist delete" : "whitelist delete",
          channel: { required: RequiredType.OPTIONAL },
          roles: isRole ? RequiredType.OPTIONAL : undefined,
          members: isRole ? undefined : RequiredType.OPTIONAL,
        })
      ).length
    ) {
      return;
    }

    const type = isBlacklist ? 0 : 1;
    const member = parsed.member;
    const role = parsed.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    const typeString = type ? "white" : "black";
    let response = "";

    if (id) {
      const dataPromises = [];
      const displayPromises = [];
      for await (const queue of parsed.args.channels) {
        if (await BlackWhiteListTable.get(type, queue.id, id)) {
          dataPromises.push(BlackWhiteListTable.unstore(type, queue.id, id));
          displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
          response += `Removed \`${name}\` from the ${typeString}list of \`${queue.name}\`.\n`;
        } else {
          // Tried to clear non-existent
          response += `\`${name}\` was not on the ${typeString}list of \`${queue.name}\`.\n`;
        }
      }
      await Promise.all(dataPromises);
      await Promise.all(displayPromises);
    } else {
      // Clear all users/roles from all queues
      const dataPromises = [];
      const displayPromises = [];
      for await (const queue of parsed.args.channels) {
        const enties = await BlackWhiteListTable.getByIsRole(type, queue.id, isRole);
        for (const entry of enties) {
          dataPromises.push(BlackWhiteListTable.unstore(type, queue.id, entry.role_member_id));
        }
        displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
      }
      await Promise.all(dataPromises);
      await Promise.all(displayPromises);
      response += `Cleared all ${typeString}lists.`;
    }

    response += await this.genBWList(parsed, type);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Display a blacklist or whitelist
   */
  public static async bwList(parsed: Parsed, isBlacklist: boolean) {
    await parsed.parseArgs({
      command: isBlacklist ? "blacklist list" : "whitelist list",
    });

    const type = isBlacklist ? 0 : 1;
    const response = await this.genBWList(parsed, type);
    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- BUTTON ------------------------------- //

  /**
   * Get button settings
   */
  public static async buttonGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "button get" });

    let response = "**Buttons**:\n";
    for await (const queue of await parsed.getQueuePairs()) {
      if (["GUILD_TEXT"].includes(queue.channel.type)) {
        response += `${queue.channel}: ${queue.stored.hide_button ? "off" : "on"}\n`;
      } else {
        response += `${queue.channel}: no buttons for voice\n`;
      }
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Enable or disable the "Join / Leave" button for a queue
   */
  public static async buttonSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "button set",
          channel: {
            required: RequiredType.OPTIONAL,
            type: ["GUILD_TEXT"],
          },
          strings: RequiredType.REQUIRED,
        })
      ).length
    ) {
      return;
    }

    if (["on", "off"].includes(parsed.string.toLowerCase())) {
      await this.applyToQueue(parsed, QueueTable.setHideButton, [ReplaceWith.QUEUE_CHANNEL_ID, parsed.string === "off"], "button");
    } else {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- CLEAR ------------------------------- //

  /**
   * Clear a queue
   */
  public static async clear(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "clear",
          channel: {
            required: RequiredType.OPTIONAL,
          },
        })
      ).length
    ) {
      return;
    }

    await this.applyToQueue(parsed, QueueMemberTable.unstore, [parsed.request.guildId, ReplaceWith.QUEUE_CHANNEL_ID]);
    let response: string;
    if (parsed.args.channels.length === 1) {
      response = `${parsed.channel} queue cleared.`;
    } else {
      response = `Cleared all queues`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- COLOR ------------------------------- //

  /**
   * the current color settings
   */
  public static async colorGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "color get" });

    let response = "**Colors**:\n";
    for await (const queue of await parsed.getQueuePairs()) {
      response += `${queue.channel}: ${queue.stored.color}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set a new color for a queue
   */
  public static async colorSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "color set",
          channel: {
            required: RequiredType.OPTIONAL,
          },
          strings: RequiredType.REQUIRED,
        })
      ).length
    ) {
      return;
    }
    if (
      ![
        "black",
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
      ].includes(parsed.string.toLowerCase())
    ) {
      await parsed
        .reply({
          content: "**ERROR**: Invalid color.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }
    await this.applyToQueue(parsed, QueueTable.setColor, [ReplaceWith.QUEUE_CHANNEL, parsed.string.toUpperCase()], "color");
  }

  // --------------------------------- DISPLAY ------------------------------- //

  /**
   * HELPER
   */
  public static async displayHelper(parsed: Parsed, storedQueue: StoredQueue, channel: GuildBasedChannel) {
    const displayChannel = parsed.request.channel as TextChannel;
    const displayPermission = displayChannel.permissionsFor(displayChannel.guild.me);
    if (!displayPermission) return;

    if (displayPermission.has("VIEW_CHANNEL") && displayPermission.has("SEND_MESSAGES") && displayPermission.has("EMBED_LINKS")) {
      const embeds = await MessagingUtils.generateEmbed(channel);
      // Remove old display
      await DisplayChannelTable.unstore(channel.id, displayChannel.id);
      // Create new display
      await DisplayChannelTable.store(channel, displayChannel, embeds);
    } else {
      await parsed
        .reply({
          content: `I don't have permission to write messages and embeds in \`${displayChannel.name}\`.`,
          messageDisplay: "DM",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
    if (!(storedQueue?.role_id || parsed.storedGuild.disable_roles)) {
      await QueueTable.createQueueRole(parsed, channel, storedQueue.color);
    }
    Validator.validateGuild(channel.guild).catch(() => null);
  }

  /**
   * Display the users in a queue. These messages stay updated
   */
  public static async display(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "display",
          channel: {
            required: RequiredType.OPTIONAL,
          },
        })
      ).length
    ) {
      return;
    }

    const dataPromises = [];
    for (const queue of parsed.args.channels) {
      dataPromises.push(this.displayHelper(parsed, await QueueTable.get(queue.id), queue));
    }
    await Promise.all(dataPromises);
    await parsed.reply({ content: "Displayed.", messageDisplay: "NONE", commandDisplay: "EPHEMERAL" }).catch(() => null);
  }

  // --------------------------------- ENQUEUE ------------------------------- //

  /**
   * Add a specified user or role to a text queue / Update queue message
   */
  public static async enqueue(parsed: Parsed, isRole: boolean) {
    if (
      (
        await parsed.parseArgs({
          command: "enqueue",
          channel: {
            required: RequiredType.REQUIRED,
          },
          members: isRole ? undefined : RequiredType.REQUIRED,
          roles: isRole ? RequiredType.REQUIRED : undefined,
        })
      ).length
    ) {
      return;
    }

    const queueChannel = parsed.channel;
    const member = parsed.member;
    const role = parsed.role;
    if (!queueChannel.id || !(member || role)) {
      return;
    }

    if (queueChannel.type !== "GUILD_TEXT") {
      if (member?.voice?.channel?.id !== queueChannel.id || role) {
        await parsed
          .reply({
            content: `**ERROR**: \`/enqueue ${queueChannel.name}\` can only be used on users who are already in the ${queueChannel} voice channel.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
        return;
      }
    }

    const customMessage = parsed.string?.substring(0, 128);
    if (member?.id) {
      try {
        await QueueMemberTable.store(queueChannel, member, customMessage, true);
        const response = `Added ${member} to ${queueChannel}.`;
        await parsed.reply({ content: response }).catch(() => null);
        await SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queueChannel);
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
          content: `Added ${role} to ${queueChannel}.` + errorText,
        })
        .catch(() => null);
      await SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queueChannel);
    }
  }

  // --------------------------------- GRACEPERIOD ------------------------------- //

  /**
   * the current grace period settings
   */
  public static async graceperiodGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "graceperiod get" });

    let response = "**Grace Periods**:\n";
    for await (const queue of await parsed.getQueuePairs()) {
      const timeString = MessagingUtils.getGracePeriodString(queue.stored.grace_period);
      response += `${queue.channel}: ${timeString || "0 seconds"}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set how long a user can leave a queue before losing their spot
   */
  public static async graceperiodSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "graceperiod set",
          channel: {
            required: RequiredType.REQUIRED,
          },
          numbers: { required: RequiredType.REQUIRED, min: 0, max: 6000, defaultValue: null },
        })
      ).length
    ) {
      return;
    }

    const timeString = MessagingUtils.getGracePeriodString(parsed.number) || "0 seconds";
    await this.applyToQueue(parsed, QueueTable.setGraceperiod, [ReplaceWith.QUEUE_CHANNEL_ID, parsed.number], "grace period", timeString);
  }

  // --------------------------------- HEADER ------------------------------- //

  /**
   * Set or remove a header for a queue's display messages
   */
  public static async headerGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "header get" });

    let response = "**Headers**:\n";
    for await (const queue of await parsed.getQueuePairs()) {
      response += `${queue.channel}: ${queue.stored.header || "none"}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set or remove a header for a queue's display messages
   */
  public static async headerSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "header set",
          channel: {
            required: RequiredType.OPTIONAL,
          },
        })
      ).length
    ) {
      return;
    }

    await this.applyToQueue(parsed, QueueTable.setHeader, [ReplaceWith.QUEUE_CHANNEL_ID, parsed.string || ""], "header");
  }

  // --------------------------------- HELP ------------------------------- //

  /**
   * Display general help messages
   */
  public static async help(parsed: Parsed) {
    await parsed.parseArgs({ command: "help" });
    const alt = parsed.storedGuild.enable_alt_prefix;

    const response: MessageEmbedOptions = {
      title: "Commands for Everyone",
      fields: [
        {
          name: "How to join queues",
          value:
            "**TEXT**: Click the button under a queue display or use `/join` & `/leave`.\n" + "**VOICE**: Join the matching voice channel.",
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
    await parsed.parseArgs({ command: "help queue" });

    const response: MessageEmbedOptions = {
      author: { name: "Privileged Commands" },
      title: "Queue Management",
      fields: [
        {
          name: "`/autopull`",
          value: "Get/Set automatic pull from a voice queue",
        },
        {
          name: "`/blacklist`",
          value: "Add/Delete/List users or roles from a queue blacklist",
        },
        {
          name: "`/button`",
          value: 'Get/Set whether a "Join / Leave" button appears under a text queue display',
        },
        {
          name: "`/clear`",
          value: "Clear a queue",
        },
        {
          name: "`/color`",
          value: "Get/Set color of queue displays",
        },
        {
          name: "`/enqueue user` & `/enqueue role`",
          value: "Add a specified user or role to a queue",
        },
        {
          name: "`/graceperiod`",
          value: "Get/Set how long users can leave a queue before losing their position",
        },
        {
          name: "`/header`",
          value: "Get/Set a header on display messages",
        },
        {
          name: "`/dequeue`",
          value: "Dequeue a user",
        },
        {
          name: "`/lock`",
          value: "Lock or unlock a queue. Locked queues can still be left",
        },
        {
          name: "`/logging`",
          value: "Get/Set a channel to log a history of bot commands and queue changes",
        },
        {
          name: "`/mentions`",
          value:
            "Get/Set whether users are displayed as mentions (on), or normal text (off). Normal text helps avoid the @invalid-user issue",
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
          value: "Get/Set the default # of users to pull when autopull is off or when using `/next`",
        },
        {
          name: "`/queues`",
          value: "Add/Delete/List queues",
        },
        {
          name: "`/roles`",
          value: "Get/Set whether queue members are assigned a role named `In queue: ...`",
        },
        {
          name: "`/schedule`",
          value: "Add/Delete/List scheduled commands",
        },
        {
          name: "`/shuffle`",
          value: "Shuffle a queue",
        },
        {
          name: "`/size`",
          value: "Get/Set the size limits of queues",
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
          name: "`/whitelist`",
          value: "Add/Delete/List/Clear users or roles from a queue whitelist",
        },
      ],
    };
    const content = parsed.hasPermission ? "✅ You can use privileged commands." : "❌ You can **NOT** use privileged commands.";
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
    await parsed.parseArgs({ command: "help bot" });

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
          value: "Get/Set display mode",
        },
        {
          name: "`/notifications`",
          value: "Get/Set notification status (on = DM users when they are pulled out. off = no DMS)",
        },
        {
          name: "`/permission`",
          value: "Add/Delete/List/Clear users and roles with bot permissions",
        },
        {
          name: "`/priority`",
          value: "Add/Delete/List/Clear users and roles with queue priority",
        },
        {
          name: "`/start`",
          value: "Add the bot to a voice queue",
        },
      ],
    };
    const content = parsed.hasPermission ? "✅ You can use privileged commands." : "❌ You can **NOT** use privileged commands.";
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
    await parsed.parseArgs({ command: "help setup" });

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
            "**TEXT**: Click the button under a queue display or use `/join` & `/leave`.\n" + "**VOICE**: Join the matching voice channel.",
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
    const content = parsed.hasPermission ? "✅ You can use privileged commands." : "❌ You can **NOT** use privileged commands.";
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
    if (
      (
        await parsed.parseArgs({
          command: "join",
          channel: {
            required: RequiredType.REQUIRED,
          },
        })
      ).length
    ) {
      return;
    }

    const queueChannel = parsed.channel;
    const author = parsed.request.member as GuildMember;

    if (queueChannel.type !== "GUILD_TEXT") {
      if (author.voice?.channel?.id !== queueChannel.id) {
        await parsed
          .reply({
            content: `**ERROR**: \`/join ${queueChannel.name}\` can only be used while you are in the ${queueChannel} voice channel.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
        return;
      }
    }

    const customMessage = parsed.string?.substring(0, 128);
    try {
      await QueueMemberTable.store(queueChannel, author, customMessage);
      await parsed
        .reply({
          content: `You joined ${queueChannel}.`,
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
    await SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queueChannel);
  }

  // --------------------------------- DEQUEUE ------------------------------- //

  /**
   * HELPER
   */
  private static async dequeueFromQueue(storedGuild: StoredGuild, queueChannel: GuildBasedChannel, members: GuildMember[]) {
    if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel.type)) {
      for await (const member of members) {
        await member?.voice?.disconnect().catch(() => null);
      }
    } else {
      await QueueMemberTable.unstore(
        storedGuild.guild_id,
        queueChannel.id,
        members.map((m) => m.id)
      );
    }
  }

  /**
   * Dequeue a user from a specified queue
   */
  public static async dequeue(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "dequeue",
          channel: {
            required: RequiredType.OPTIONAL,
          },
          members: RequiredType.REQUIRED,
        })
      ).length
    ) {
      return;
    }

    let response = "";
    const dataPromises = [];
    const displayPromises = [];
    for (const queue of parsed.args.channels) {
      response += `Dequeue-ed ${parsed.member} from \`${queue.name}\` queue.\n`;
      dataPromises.push(this.dequeueFromQueue(parsed.storedGuild, queue, [parsed.member]));
      displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
    }
    await Promise.all(dataPromises);
    await Promise.all(displayPromises);
    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- LEAVE ------------------------------- //

  /**
   * Leave a text queue
   */
  public static async leave(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "leave",
          channel: {
            required: RequiredType.OPTIONAL,
          },
        })
      ).length
    ) {
      return;
    }

    const author = parsed.request.member as GuildMember;
    let response = "";
    const dataPromises = [];
    const displayPromises = [];
    for await (const queue of parsed.args.channels) {
      const storedMember = await QueueMemberTable.get(queue.id, author.id);
      if (storedMember) {
        response += `You left \`${queue.name}\`.\n`;
        dataPromises.push(QueueMemberTable.unstore(queue.guild.id, queue.id, [author.id]));
        displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
      }
    }
    await Promise.all(dataPromises);
    await Promise.all(displayPromises);
    await parsed.reply({ content: response, commandDisplay: "EPHEMERAL" }).catch(() => null);
  }

  // --------------------------------- LOCK ------------------------------- //

  /**
   * Get whether a queue is locked or unlocked
   */
  public static async lockGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "lock get" });

    for await (const queue of await parsed.getQueuePairs()) {
      const storedQueue = await QueueTable.get(queue.channel.id);
      let response = `${queue.channel}: ${storedQueue.is_locked ? "locked" : "unlocked"}.`;
      await parsed.reply({ content: response }).catch(() => null);
    }
  }

  /**
   * Lock or unlock a queue. Locked queues can still be left
   */
  public static async lockSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "lock set",
          channel: {
            required: RequiredType.OPTIONAL,
          },
          strings: RequiredType.REQUIRED,
        })
      ).length
    ) {
      return;
    }
    let response = "";
    if (["lock", "unlock"].includes(parsed.string.toLowerCase())) {
      for await (const queue of parsed.args.channels) {
        const storedQueue = await QueueTable.get(queue.id);
        if ((storedQueue.is_locked && parsed.string === "lock") || (!storedQueue.is_locked && parsed.string === "unlock")) {
          response += `\`${queue.name}\` was already ${parsed.string}ed.\n`;
        } else {
          await QueueTable.setLock(queue.id, parsed.string === "lock");
          if (parsed.string === "unlock" && queue.type === "GUILD_VOICE") {
            queue.members.each((member) => QueueMemberTable.store(queue, member));
          }
          response += `${parsed.string === "lock" ? "Locked " : "Unlocked "} \`${queue.name}\`.\n`;
          await SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue);
        }
      }
    } else {
      response = "**ERROR**: Missing required argument: `lock` or `unlock`.";
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- LOGGING CHANNEL ------------------------------- //

  /**
   * Get current logging setting
   */
  public static async loggingGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "logging get" });

    const levelString = parsed.storedGuild.logging_channel_level === 0 ? "default" : "everything";
    const response = parsed.storedGuild.logging_channel_id
      ? `Logging channel set to <#${parsed.storedGuild.logging_channel_id}>. Level = **${levelString}**.`
      : `No logging channel set.`;

    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set a dedicated logging channel for bot messages. Use without args to unset logging channel.
   */
  public static async loggingSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "logging set",
          channel: {
            required: RequiredType.OPTIONAL,
          },
          strings: RequiredType.OPTIONAL,
        })
      ).length
    ) {
      return;
    }

    const level = parsed.string || "default";
    await QueueGuildTable.setLoggingChannel(parsed.request.guildId, parsed.channel?.id, level);
    const response = parsed.channel ? `Set logging channel to ${parsed.channel}. Level = **${level}**.` : `Unset logging channel.`;

    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- MENTIONS ------------------------------- //

  /**
   * Get whether users are displayed as mentions (on), or normal text (off)
   */
  public static async mentionsGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "mentions get" });

    await parsed
      .reply({
        content: "**Mentions**: " + (parsed.storedGuild.disable_mentions ? "off" : "on"),
      })
      .catch(() => null);
  }

  /**
   * Set whether users are displayed as mentions (on), or normal text (off)
   */
  public static async mentionsSet(parsed: Parsed) {
    if ((await parsed.parseArgs({ command: "mentions set", strings: RequiredType.REQUIRED })).length) {
      return;
    }

    if (["on", "off"].includes(parsed.string.toLowerCase())) {
      if (
        (parsed.storedGuild.disable_mentions && parsed.string === "off") ||
        (!parsed.storedGuild.disable_mentions && parsed.string === "on")
      ) {
        await parsed
          .reply({
            content: `Mentions were already ${parsed.string}.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
      } else {
        const guild = parsed.request.guild;
        const disableMentions = parsed.string !== "on";
        await QueueGuildTable.setDisableMentions(guild.id, disableMentions);
        await parsed
          .reply({
            content: `Set mentions to \`${parsed.string}\`.`,
          })
          .catch(() => null);
        const displayPromises = [];
        for await (const queue of await parsed.getQueueChannels()) {
          displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
        }
        await Promise.all(displayPromises);
      }
    } else {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- MODE ------------------------------- //

  /**
   * Get the way queue displays are sent
   */
  public static async modeGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "mode get" });

    let response = "**Messaging Mode**:\n";
    switch (parsed.storedGuild.msg_mode) {
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
   * Set the way queue displays are sent
   */
  public static async modeSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "mode set",
          numbers: { required: RequiredType.REQUIRED, min: 1, max: 3, defaultValue: 1 },
        })
      ).length
    ) {
      return;
    }

    if (![1, 2, 3].includes(parsed.number)) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `1`, `2`, or `3`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }

    await QueueGuildTable.setMessageMode(parsed.request.guildId, parsed.number);
    await parsed
      .reply({
        content: `Set messaging mode to \`${parsed.number}\`.`,
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
        await parsed.parseArgs({
          command: "move",
          channel: {
            required: RequiredType.REQUIRED,
          },
          members: RequiredType.REQUIRED,
          numbers: { required: RequiredType.REQUIRED, min: 1, max: 9999, defaultValue: null },
        })
      ).length
    ) {
      return;
    }

    const position = parsed.number;
    const member = parsed.member;
    const queueChannel = parsed.channel;
    if (!position || !member.id || !queueChannel.id) {
      return;
    }
    const storedMember = await QueueMemberTable.get(queueChannel.id, member.id);
    if (!storedMember) {
      return;
    }

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
      promises.push(QueueMemberTable.setCreatedAt(queueChannel.id, queueMembers[i].member_id, queueMemberTimeStamps[i]));
    }
    await Promise.all(promises);
    await SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queueChannel);
    await parsed
      .reply({
        content: `Moved ${member} to position **${position}** of ${queueChannel}.`,
      })
      .catch(() => null);
  }

  // --------------------------------- MYQUEUES ------------------------------- //

  /**
   * Display the queues you are in with your position
   */
  public static async myQueues(parsed: Parsed) {
    await parsed.parseArgs({ command: "myqueue" });

    const author = parsed.request.member as GuildMember;
    const storedChannelIds = (await QueueTable.getFromGuild(author.guild.id)).map((ch) => ch.queue_channel_id);
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
        if (!queueChannel) {
          continue;
        }
        const memberIds = (await QueueMemberTable.getFromQueueOrdered(queueChannel)).map((member) => member.member_id);
        embed.addField(
          queueChannel.name,
          `${memberIds.indexOf(author.id) + 1} ${author}` + (entry.personal_message ? ` -- ${entry.personal_message}` : "")
        );
      }
      await parsed.reply({ embeds: [embed], commandDisplay: "EPHEMERAL" }).catch(() => null);
    }
  }

  // --------------------------------- NEXT ------------------------------- //

  /**
   * Pull user(s) from a queue and display their name(s)
   */
  public static async next(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "next",
          channel: {
            required: RequiredType.REQUIRED,
          },
          numbers: { required: RequiredType.OPTIONAL, min: 1, max: 99, defaultValue: null },
        })
      ).length
    ) {
      return;
    }

    const queueChannel = parsed.channel;
    const storedQueue = await QueueTable.get(queueChannel.id);
    if (!storedQueue) {
      await parsed
        .reply({
          content: `${queueChannel} is not a queue.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }
    await this.pullHelper({ stored: storedQueue, channel: queueChannel }, parsed);
  }

  /**
   * HELPER
   */
  public static async pullHelper(queue: QueuePair, parsed?: Parsed, targetChannel?: VoiceChannel | StageChannel) {
    // Get the oldest member entries for the queue
    const amount = parsed?.number || queue.stored.pull_num || 1;
    const queueMembers = await QueueMemberTable.getFromQueueOrdered(queue.channel, amount);
    const storedGuild = parsed?.storedGuild || (await QueueGuildTable.get(queue.channel.guildId));
    targetChannel =
      targetChannel || (queue.channel.guild.channels.cache.get(queue.stored.target_channel_id) as VoiceChannel | StageChannel);

    if (queueMembers.length > 0) {
      // Check enable_partial_pull
      if (!queue.stored.enable_partial_pull && queueMembers.length < amount) {
        await parsed
          ?.reply({
            content:
              `${queue.channel} only has **${queueMembers.length}** member${
                queueMembers.length > 1 ? "s" : ""
              }, **${amount}** are needed. ` +
              `To allow pulling of fewer than **${amount}** member${
                queueMembers.length > 1 ? "s" : ""
              }, use \`/pullnum\` and enable \`partial_pulling\`.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
        return;
      }
      // Display and remove member from the queue
      if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queue.channel.type)) {
        if (targetChannel) {
          const promises = [];
          for (const queueMember of queueMembers) {
            promises.push(
              QueueMemberTable.getMemberFromQueueMember(queue.channel, queueMember)
                .then((m) => m.voice.setChannel(targetChannel))
                .catch(() => null)
            );
          }
          await Promise.all(promises);
        } else {
          await parsed
            ?.reply({
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
            QueueMemberTable.getMemberFromQueueMember(queue.channel, queueMember).then((member) => {
              if (member && !storedGuild.disable_notifications) {
                member
                  .send(`You were just pulled from the ${queue.channel} queue ` + `in \`${queue.channel.guild.name}\`. Thanks for waiting!`)
                  .catch(() => null);
              }
            })
          );
        }
        await Promise.all(promises);
      }
      const response = "Pulled " + queueMembers.map((member) => `<@${member.member_id}>`).join(", ") + ` from ${queue.channel}.`;
      if (parsed) {
        await parsed?.reply({ content: response }).catch(() => null);
      } else {
        const displayChannel = await DisplayChannelTable.getFirstChannelFromQueue(queue.channel.guild, queue.channel.id);
        await displayChannel?.send(response).catch(() => null);
      }
      await QueueMemberTable.unstore(
        queue.channel.guild.id,
        queue.channel.id,
        queueMembers.map((member) => member.member_id)
      );
      await SchedulingUtils.scheduleDisplayUpdate(storedGuild, queue.channel);
    } else {
      await parsed
        ?.reply({
          content: `${queue.channel} is empty.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- NOTIFICATIONS ------------------------------- //

  public static async notificationsGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "notifications get" });
    await parsed
      .reply({
        content: "**Notifications**: " + (parsed.storedGuild.disable_notifications ? "off" : "on"),
      })
      .catch(() => null);
  }

  public static async notificationsSet(parsed: Parsed) {
    if ((await parsed.parseArgs({ command: "notifications set", strings: RequiredType.REQUIRED })).length) {
      return;
    }

    if (["on", "off"].includes(parsed.string.toLowerCase())) {
      if (
        (parsed.storedGuild.disable_notifications && parsed.string === "off") ||
        (!parsed.storedGuild.disable_notifications && parsed.string === "on")
      ) {
        await parsed
          .reply({
            content: `Notifications were already ${parsed.string}.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
      } else {
        await QueueGuildTable.setDisableNotifications(parsed.request.guildId, parsed.string === "off");
        await parsed
          .reply({
            content: `Notifications have been turned **${parsed.string}**.`,
          })
          .catch(() => null);
      }
    } else {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- PERMISSIONS ------------------------------- //

  /**
   * HELPER
   */
  private static async genPermissionList(parsed: Parsed) {
    let response = "\n**Roles and users with bot permission**: ";

    const perms = await AdminPermissionTable.getMany(parsed.request.guildId);
    if (perms?.length) {
      response += perms.map((status) => "<@" + (status.is_role ? "&" : "") + status.role_member_id + ">").join(", ");
    } else {
      response += "Empty";
    }
    return response;
  }

  /**
   * Grant permission to a user or role to use bot commands
   */
  static async permissionAdd(parsed: Parsed, isRole: boolean) {
    if (
      (
        await parsed.parseArgs({
          command: "permission add",
          members: isRole ? undefined : RequiredType.REQUIRED,
          roles: isRole ? RequiredType.REQUIRED : undefined,
        })
      ).length
    ) {
      return;
    }

    const member = parsed.member;
    const role = parsed.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    let response = "";

    if (await AdminPermissionTable.get(parsed.request.guildId, id)) {
      response += `\`${name}\` already has bot permission.`;
    } else {
      await AdminPermissionTable.store(parsed.request.guildId, id, role != null);
      response += `Added bot permission for \`${name}\`.`;
    }
    response += await this.genPermissionList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Revoke permission from a user or role to use bot commands
   */
  public static async permissionDelete(parsed: Parsed, isRole: boolean) {
    if (
      (
        await parsed.parseArgs({
          command: "permission delete",
          members: isRole ? undefined : RequiredType.OPTIONAL,
          roles: isRole ? RequiredType.OPTIONAL : undefined,
        })
      ).length
    ) {
      return;
    }

    const member = parsed.member;
    const role = parsed.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    let response = "";

    if (!id) {
      await AdminPermissionTable.unstore(parsed.request.guildId);
      await parsed.reply({ content: "Cleared bot permission list." }).catch(() => null);
      return;
    }
    if (await AdminPermissionTable.get(parsed.request.guildId, id)) {
      await AdminPermissionTable.unstore(parsed.request.guildId, id);
      response += `Removed bot permission for \`${name}\`.`;
    } else {
      response += `\`${name}\` did not have bot permission.`;
    }
    response += await this.genPermissionList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * List roles and users with permission
   */
  public static async permissionList(parsed: Parsed) {
    await parsed.parseArgs({ command: "permission list" });

    const response = await this.genPermissionList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
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
        (entry.is_role ? parsed.request.guild.roles : parsed.request.guild.members).fetch(entry.role_member_id).catch((e) => {
          if ([403, 404].includes(e.httpStatus)) {
            PriorityTable.unstore(parsed.storedGuild.guild_id, entry.role_member_id);
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
    let response = "\n**Users and Roles with Priority**: ";

    const storedEntries = await PriorityTable.getMany(parsed.storedGuild.guild_id);
    this.validatePriorityList(parsed, storedEntries).then();
    if (storedEntries?.length) {
      response += storedEntries.map((entry) => "<@" + (entry.is_role ? "&" : "") + entry.role_member_id + ">").join(", ");
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
    for await (const queue of await parsed.getQueuePairs()) {
      // Get members for each queue channel
      const storedMembers = await QueueMemberTable.getFromQueueUnordered(queue.channel);
      for await (const storedMember of storedMembers) {
        const queueMember = await QueueMemberTable.getMemberFromQueueMember(queue.channel, storedMember);
        if (!queueMember) {
          continue;
        }
        // Re-evaluate priority for each member
        const roleIds = queueMember.roles.cache.keys();
        if ([queueMember.id, ...roleIds].some((id) => priorityIds.includes(id))) {
          QueueMemberTable.setPriority(queue.channel.id, queueMember.id, true).then();
        } else {
          QueueMemberTable.setPriority(queue.channel.id, queueMember.id, false).then();
        }
      }
      // Schedule display update for each queue
      await SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue.channel);
    }
  }

  /**
   * Grant priority in queue to a user or role
   */
  static async priorityAdd(parsed: Parsed, isRole: boolean) {
    if (
      (
        await parsed.parseArgs({
          command: "priority add",
          members: isRole ? undefined : RequiredType.REQUIRED,
          roles: isRole ? RequiredType.REQUIRED : undefined,
        })
      ).length
    ) {
      return;
    }

    const member = parsed.member;
    const role = parsed.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    const guildId = parsed.request.guildId;
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
   * HELPER
   */
  static async priorityDelete(parsed: Parsed, isRole: boolean) {
    if (
      (
        await parsed.parseArgs({
          command: "priority delete",
          members: isRole ? undefined : RequiredType.OPTIONAL,
          roles: isRole ? RequiredType.OPTIONAL : undefined,
        })
      ).length
    ) {
      return;
    }

    const member = parsed.member;
    const role = parsed.role;
    const id = member?.id || role?.id;
    const name = member?.displayName || role?.name;
    const guildId = parsed.request.guildId;
    let response = "";

    if (!id) {
      await PriorityTable.unstore(guildId);
      await parsed.reply({ content: "Cleared priority list." }).catch(() => null);
      return;
    }
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
   * List roles and users with priority in queue
   */
  public static async priorityList(parsed: Parsed) {
    await parsed.parseArgs({ command: "priority list" });

    const response = await this.genPriorityList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- PULLNUM ------------------------------- //

  /**
   * the current pullnum settings
   */
  public static async pullnumGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "pullnum get" });

    let response = "**Pull nums**:\n";
    for await (const queue of await parsed.getQueuePairs()) {
      response += `${queue.channel} ${queue.stored.pull_num}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Get/Set the default # of users to pull when autopull is off or when using the `next` command
   */
  public static async pullnumSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "pullnum set",
          channel: {
            required: RequiredType.OPTIONAL,
          },
          numbers: { required: RequiredType.REQUIRED, min: 1, max: 99, defaultValue: 1 },
          strings: RequiredType.REQUIRED,
        })
      ).length
    ) {
      return;
    }

    if (["on", "off"].includes(parsed.string.toLowerCase())) {
      const enablePartialPulling = parsed.string.toLowerCase() === "on";
      await this.applyToQueue(
        parsed,
        QueueTable.setPullnum,
        [ReplaceWith.QUEUE_CHANNEL_ID, parsed.number, enablePartialPulling],
        "pull number"
      );
    } else {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- QUEUES ------------------------------- //

  /**
   * HELPER
   */
  private static async genQueuesList(parsed: Parsed): Promise<string> {
    const queueChannels = await QueueTable.fetchFromGuild(parsed.request.guild);
    if (queueChannels.size) {
      return "\nQueues: " + queueChannels.map((ch) => `${ch}`).join(", ");
    } else {
      return "\nNo queue channels set. Set a new queue channel using `/queues add`.";
    }
  }

  /**
   * HELPER
   */
  private static async storeQueue(parsed: Parsed, channel: GuildBasedChannel, size: number) {
    await QueueTable.store(parsed, channel, size);
    const response = `Created ${channel} queue.` + (await this.genQueuesList(parsed));
    await parsed.reply({ content: response }).catch(() => null);
    const storedQueue = await QueueTable.get(channel.id);
    await this.displayHelper(parsed, storedQueue, channel);
  }

  /**
   * Add a new queue
   */
  public static async queuesAdd(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "queues add",
          channel: {
            required: RequiredType.REQUIRED,
          },
          numbers: { required: RequiredType.OPTIONAL, min: 1, max: 99, defaultValue: null },
        })
      ).length
    ) {
      return;
    }

    const channel = parsed.channel;
    const queueChannels = await QueueTable.fetchFromGuild(parsed.request.guild);

    if (queueChannels.some((stored) => stored.id === channel.id)) {
      await parsed
        .reply({
          content: `${channel} is already a queue.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      const channelLim = (channel as VoiceChannel | StageChannel).userLimit;
      let size = parsed.number;
      if (!size && channelLim) {
        size = channelLim;
      }
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
              content: `**ERROR**: I need the **CONNECT** permission in the ${channel} voice channel to pull in queue members.`,
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
    if (
      (
        await parsed.parseArgs({
          command: "queues delete",
          channel: {
            required: RequiredType.REQUIRED,
          },
        })
      ).length
    ) {
      return;
    }

    const queueChannel = parsed.channel;
    const storedQueue = await QueueTable.get(queueChannel.id);
    if (storedQueue) {
      await QueueTable.unstore(parsed.request.guildId, queueChannel.id, parsed);
      const response = `Deleted queue for ${queueChannel}.` + (await this.genQueuesList(parsed));
      await parsed
        .reply({
          content: response,
        })
        .catch(() => null);
      getVoiceConnection((queueChannel as VoiceChannel | StageChannel).guild.id)?.destroy();
    } else {
      const response = `${queueChannel} is not a queue.` + (await this.genQueuesList(parsed));
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
    await parsed.parseArgs({ command: "queues list" });

    const response = await this.genQueuesList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- ROLES ------------------------------- //

  /**
   * Get whether queue members are assigned a role named "In queue: ..."
   */
  public static async rolesGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "roles get" });
    await parsed
      .reply({
        content: "**Queue Roles**: " + (parsed.storedGuild.disable_roles ? "off" : "on"),
      })
      .catch(() => null);
  }

  /**
   * Set whether queue members are assigned a role named "In queue: ..."
   */
  public static async rolesSet(parsed: Parsed) {
    if ((await parsed.parseArgs({ command: "roles set", strings: RequiredType.REQUIRED })).length) {
      return;
    }

    if (!["on", "off"].includes(parsed.string.toLowerCase())) {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: `on` or `off`.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    } else {
      const guild = parsed.request.guild;
      const disableRoles = parsed.string === "off";
      await QueueGuildTable.setDisableRoles(guild.id, disableRoles);
      await parsed.reply({ content: `Set roles to \`${parsed.string}\`.` }).catch(() => null);

      const storedQueues = await QueueTable.getFromGuild(guild.id);
      for await (const storedQueue of storedQueues) {
        const channel = (await parsed.getChannels()).find((ch) => ch.id === storedQueue.queue_channel_id);
        if (!channel) {
          continue;
        }
        // Delete old role
        const oldRole = await guild.roles.fetch(storedQueue.role_id).catch(() => null as Role);
        if (oldRole) {
          await QueueTable.deleteRoleId(channel).catch(() => null);
          try {
            await oldRole.delete();
          } catch (e) {
            // nothing
          }
        }
        // Create role and assign it to members
        if (parsed.args.strings?.[1]) {
          await QueueGuildTable.setRolePrefix(guild.id, parsed.args.strings?.[1] + " ");
        }
        const role = await QueueTable.createQueueRole(parsed, channel, storedQueue.color);
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

  // --------------------------------- SCHEDULE CLEAR  ------------------------------- //

  /**
   * Add a scheduled command
   */
  public static async scheduleAdd(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "schedule add",
          channel: {
            required: RequiredType.REQUIRED,
          },
          strings: RequiredType.REQUIRED,
          numbers: {
            min: -11,
            max: 12,
            defaultValue: null,
          },
        })
      ).length
    ) {
      return;
    }

    let command = parsed.string.toLowerCase();
    let schedule = parsed.args.strings[1];
    const utcOffset = parsed.number;

    // Validate command
    if (!Object.values(ScheduleCommand).includes(command as ScheduleCommand)) {
      await parsed
        .reply({
          content: `Invalid command. Supported commands: \`clear\`, \`display\`, \`next\`, \`shuffle\`.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }
    const queueChannel = parsed.channel;
    // Validate schedule
    if (!cronValidate(schedule) || schedule.split(" ").length !== 5) {
      await parsed
        .reply({
          content: `Invalid cron schedule. Please see https://crontab.guru/examples.html. Minimum value is every minute.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }
    // Turn UTC Offset into utcTime
    const timezone = Base.getTimezone(utcOffset).timezone;
    // Schedule command
    await SchedulingUtils.scheduleCommand(queueChannel.id, command as ScheduleCommand, schedule, utcOffset);
    // Store - stored entries are fed into node-cron at startup
    await ScheduleTable.store(queueChannel.id, command as ScheduleCommand, schedule, utcOffset);
    await SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queueChannel);

    const commandString = command === "next" ? "pull" : command;
    const response = `\nScheduled ${queueChannel} to \`${commandString}\` **${cronstrue.toString(schedule)}** ${timezone}.`;
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Delete a scheduled command
   */
  public static async scheduleDelete(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "schedule delete",
          channel: {
            required: RequiredType.OPTIONAL,
          },
          strings: RequiredType.OPTIONAL,
        })
      ).length
    ) {
      return;
    }

    const command = parsed.string?.toLowerCase() as ScheduleCommand;
    // Validate command
    if (command && !Object.values(ScheduleCommand).includes(command as ScheduleCommand)) {
      await parsed
        .reply({
          content: `Invalid command. Supported commands: \`clear\`, \`display\`, \`next\`, \`shuffle\`.`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }

    let response = "";
    if (command) {
      // Clear one command
      const dataPromises = [];
      const displayPromises = [];
      for await (const queue of parsed.args.channels) {
        if (await ScheduleTable.get(queue.id, command)) {
          dataPromises.push(ScheduleTable.unstore(queue.id, command), SchedulingUtils.stopScheduledCommand(queue.id, command));
          displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
          response += `Cleared scheduled ${command === "next" ? "pull" : command}s of \`${queue.name}\`.\n`;
        } else {
          // Tried to clear non-existent
          response += `There was no scheduled ${command === "next" ? "pull" : command}s of of \`${queue.name}\`.\n`;
        }
      }
      await Promise.all(dataPromises);
      await Promise.all(displayPromises);
    } else {
      // Clear all commands
      const dataPromises = [];
      const displayPromises = [];
      for (const queue of parsed.args.channels) {
        dataPromises.push(ScheduleTable.unstore(queue.id, command), SchedulingUtils.stopScheduledCommand(queue.id, command));
        displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
        response += `Cleared all scheduled commands of \`${queue.name}\`.\n`;
      }
      await Promise.all(dataPromises);
      await Promise.all(displayPromises);
    }
    response += await this.genScheduleList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * elp with writing schedules
   */
  public static async scheduleHelp(parsed: Parsed) {
    await parsed.parseArgs({ command: "schedule help" });
    await parsed
      .reply({
        content:
          "`schedule` should be written in cron format ( * * * * * ). https://crontab.guru/examples.html" +
          " has many examples and a tool for creating a custom schedule. Minimum value is every minute.\n\n" +
          "`utc-offset` is used as a timezone approximation. https://www.timeanddate.com/time/map/ is an easy way to find your offset (# on the bottom of the map). " +
          "There is no way to pick between Standard and Daylight time, the bot will tell you which timezone is used.\n\n" +
          "**Example**\n" +
          "Clear a queue every day at 2am in the Eastern Time timezone.\n" +
          "`/schedule set` `queue` `clear` `0 2 * * *` `-6`",
        commandDisplay: "EPHEMERAL",
      })
      .catch(() => null);
  }

  private static async genScheduleList(parsed: Parsed): Promise<string> {
    let response = "";
    for await (const queue of await parsed.getQueuePairs()) {
      const scheduleString = await SchedulingUtils.getSchedulesString(queue.channel.id);
      if (scheduleString) {
        response += `\n${queue.channel}:` + scheduleString;
      }
    }
    if (response.length === 0) {
      response = "\nNone.";
    }
    return "**Schedules**:" + response;
  }

  /**
   * List scheduled commands
   */
  public static async scheduleList(parsed: Parsed) {
    await parsed.parseArgs({ command: "schedule list" });

    let response = await this.genScheduleList(parsed);
    await parsed.reply({ content: response }).catch(() => null);
  }

  // --------------------------------- SHUFFLE ------------------------------- //

  /**
   * HELPER
   */
  public static async shuffleHelper(queue: QueuePair) {
    if (!queue.channel?.guildId) return;
    const storedGuild = await QueueGuildTable.get(queue.channel.guildId);
    const queueMembers = await QueueMemberTable.getFromQueueUnordered(queue.channel);
    const queueMemberTimeStamps = queueMembers.map((member) => member.created_at);
    Base.shuffle(queueMemberTimeStamps);
    for (let i = 0; i < queueMembers.length; i++) {
      await QueueMemberTable.setCreatedAt(queue.channel.id, queueMembers[i].member_id, queueMemberTimeStamps[i]);
    }
    await SchedulingUtils.scheduleDisplayUpdate(storedGuild, queue.channel);
  }

  /**
   * Shuffle a queue
   */
  public static async shuffle(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "shuffle",
          channel: {
            required: RequiredType.OPTIONAL,
          },
        })
      ).length
    ) {
      return;
    }

    const dataPromises = [];
    for (const queue of parsed.args.channels) {
      dataPromises.push(this.shuffleHelper({ stored: await QueueTable.get(queue.id), channel: queue }));
    }
    await Promise.all(dataPromises);

    if (parsed.args.channels.length > 1) {
      await parsed?.reply({ content: `All queues shuffled.` }).catch(() => null);
    } else {
      await parsed?.reply({ content: `${parsed.channel} queue shuffled.` }).catch(() => null);
    }
  }

  // --------------------------------- SIZE ------------------------------- //

  /**
   * the current queue sizes
   */
  public static async sizeGet(parsed: Parsed) {
    await parsed.parseArgs({ command: "size get" });

    let response = "**Sizes**:\n";
    for await (const queue of await parsed.getQueuePairs()) {
      response += `${queue.channel}: ${queue.stored.max_members || "none"}\n`;
    }
    await parsed.reply({ content: response }).catch(() => null);
  }

  /**
   * Set the size of a queue
   */
  public static async sizeSet(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "set set",
          channel: {
            required: RequiredType.REQUIRED,
          },
          numbers: { required: RequiredType.REQUIRED, min: 1, max: 99, defaultValue: null },
        })
      ).length
    ) {
      return;
    }

    let printHelpMessage = false;
    const dataPromises = [];
    const displayPromises = [];
    for (const queue of parsed.args.channels) {
      dataPromises.push(QueueTable.setMaxMembers(queue.id, parsed.number));
      displayPromises.push(SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, queue));
      if (queue.type === "GUILD_VOICE") {
        if (queue.permissionsFor(parsed.request.guild.me).has("MANAGE_CHANNELS")) {
          queue.setUserLimit(parsed.number).catch(() => null);
        } else {
          printHelpMessage = true;
        }
      }
    }
    await Promise.all(dataPromises);
    await Promise.all(displayPromises);

    if (parsed.args.channels.length > 1) {
      await parsed?.reply({ content: `Set size of all queues to ${parsed.number}.` }).catch(() => null);
    } else {
      await parsed?.reply({ content: `Set size of ${parsed.channel} to ${parsed.number}.` }).catch(() => null);
    }

    if (printHelpMessage) {
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

  // --------------------------------- START ------------------------------- //

  /**
   * Add the bot to a voice queue
   */
  public static async start(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "start",
          channel: {
            required: RequiredType.REQUIRED,
            type: ["GUILD_VOICE", "GUILD_STAGE_VOICE"],
          },
        })
      ).length
    ) {
      return;
    }

    const queueChannel = parsed.channel as VoiceChannel | StageChannel;

    if (queueChannel.permissionsFor(parsed.request.guild.me).has("CONNECT")) {
      if (queueChannel.full) {
        await parsed
          .reply({
            content: `**ERROR**: I can't join ${queueChannel} because it is full.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
      } else {
        const connection = joinVoiceChannel({
          channelId: queueChannel.id,
          guildId: queueChannel.guild.id,
          adapterCreator: queueChannel.guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
        });
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            // Seems to be reconnecting to a new channel - ignore disconnect
          } catch (error) {
            // Seems to be a real disconnect which SHOULDN'T be recovered from
            connection.destroy();
          }
        });
        await parsed
          .reply({
            content: "Started.",
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
    await parsed.parseArgs({ command: "timestamp get" });

    await parsed
      .reply({
        content: "**Timestamps**: " + parsed.storedGuild.timestamps,
      })
      .catch(() => null);
  }

  /**
   * Enable or disable a joined-at timestamps next to each user in queue
   */
  public static async timestampsSet(parsed: Parsed) {
    if ((await parsed.parseArgs({ command: "timestamp set", strings: RequiredType.REQUIRED })).length) {
      return;
    }

    if (["date", "time", "date+time", "relative", "off"].includes(parsed.string.toLowerCase())) {
      if (parsed.storedGuild.timestamps === parsed.string) {
        await parsed
          .reply({
            content: `Timestamps were already set to **${parsed.string}**.`,
            commandDisplay: "EPHEMERAL",
          })
          .catch(() => null);
      } else {
        await QueueGuildTable.setTimestamps(parsed.request.guildId, parsed.string);
        await parsed
          .reply({
            content: `Timestamps have been set to **${parsed.string}**.`,
          })
          .catch(() => null);
        // Update displays
        const channelIds = (await QueueTable.getFromGuild(parsed.storedGuild.guild_id)).map((c) => c.queue_channel_id);
        for (const chId of channelIds) {
          const channel = parsed.request.guild.channels.cache.find((ch) => ch.id === chId);
          await SchedulingUtils.scheduleDisplayUpdate(parsed.storedGuild, channel);
        }
      }
    } else {
      await parsed
        .reply({
          content: "**ERROR**: Missing required argument: **date**, **time**, **date+time**, **relative**, **off**.",
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
    }
  }

  // --------------------------------- TO-ME ------------------------------- //

  /**
   * Pull user(s) from a queue and display their name(s)
   */
  public static async toMe(parsed: Parsed) {
    if (
      (
        await parsed.parseArgs({
          command: "to-me",
          channel: {
            required: RequiredType.REQUIRED,
            type: ["GUILD_VOICE"],
          },
          numbers: { required: RequiredType.OPTIONAL, min: 1, max: 99, defaultValue: null },
        })
      ).length
    ) {
      return;
    }

    const queueChannel = parsed.channel;
    const storedQueue = await QueueTable.get(queueChannel.id);
    if (!storedQueue) {
      await parsed
        .reply({
          content: `${queueChannel} is not a queue`,
          commandDisplay: "EPHEMERAL",
        })
        .catch(() => null);
      return;
    }

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

    await this.pullHelper({ stored: storedQueue, channel: queueChannel }, parsed, targetChannel);
  }
}
