import {
   GuildChannel,
   Message,
   MessageEmbedOptions,
   MessageOptions,
   NewsChannel,
   TextChannel,
   VoiceChannel,
} from "discord.js";
import { ParsedArguments, QueueChannel, QueueGuild, QueueMember } from "./utilities/Interfaces";
import { Base } from "./utilities/Base";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { ParsingUtils } from "./utilities/ParsingUtils";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { SchedulingUtils } from "./utilities/SchedulingUtils";

export class Commands {
   /**
    * Create an embed message to display a channel's queue
    * @param queueGuild
    * @param parsed Parsed message - prefix, command, argument.
    * @param message Discord message object.
    * @param queueChannel
    */
   public static async displayQueue(
      queueGuild: QueueGuild,
      parsed: ParsedArguments,
      message: Message,
      queueChannel?: VoiceChannel | TextChannel | NewsChannel
   ): Promise<void> {
      queueChannel = queueChannel || (await ParsingUtils.fetchChannel(queueGuild, parsed, message));
      if (!queueChannel) return;

      const displayChannel = message.channel as TextChannel | NewsChannel;
      const displayPermissions = displayChannel.permissionsFor(displayChannel.guild.me);
      if (displayPermissions.has("SEND_MESSAGES") && displayPermissions.has("EMBED_LINKS")) {
         const embeds = await MessagingUtils.generateEmbed(queueGuild, queueChannel);
         // Remove old display
         await DisplayChannelTable.unstoreDisplayChannel(queueChannel.id, displayChannel.id);
         // Create new display
         await DisplayChannelTable.storeDisplayChannel(queueChannel, displayChannel, embeds);
      } else {
         message.author
            .send(`I don't have permission to write messages and embeds in \`${displayChannel.name}\`.`)
            .catch(() => null);
      }
   }

   /**
    * Send a help embed
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async help(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const storedPrefix = queueGuild.prefix;
      const storedColor = queueGuild.color;

      const responses: MessageOptions[] = [
         {
            embed: {
               author: {
                  iconURL: "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/icon.png",
                  name: "Queue Bot",
                  url: "https://top.gg/bot/679018301543677959",
               },
               color: storedColor,
               description:
                  "*Privileged* users are the server owner, administrators, and users with any of the following roles:" +
                  "`mod`, `moderator`, `admin`, `administrator`.",
               fields: [
                  {
                     name: "1. Create a Queue",
                     value:
                        `*Privileged* users can create queues with \`${storedPrefix}${
                           Base.getConfig().queueCmd
                        } {channel name}\` ` +
                        `where \`{channel name}\` is the name of a text or voice channels. For example, ` +
                        `\`${storedPrefix}${
                           Base.getConfig().queueCmd
                        } Waiting Room\` turns the Waiting Room voice channel into a queue.`,
                  },
                  {
                     name: "2. Join a Queue",
                     value:
                        `Any user can join text queues by clicking the queue reaction or with ` +
                        `\`${storedPrefix}${Base.getConfig().joinCmd} {queue name}\`. ` +
                        `Any user can join voice queues by joining the matching voice channel.`,
                  },
                  {
                     name: "3. Pull Users From a Queue",
                     value:
                        `**TEXT**: *Privileged* users can be pulled from a text queue with ` +
                        `\`${storedPrefix}${Base.getConfig().nextCmd} {queue name}\`.\n` +
                        `**VOICE**: Pulling users from voice queues requires 2 steps:\n` +
                        `1. \`${storedPrefix}${
                           Base.getConfig().startCmd
                        } {queue name}\` makes the bot join the voice channel.\n` +
                        `2. Move the bot to a new channel to set a "target".\n` +
                        `If the target channel has a user limit, ` +
                        `(\`${storedPrefix}${Base.getConfig().limitCmd} {queue name} {#}\`), ` +
                        `the bot will automatically move people from the queue to keep the target channel full. ` +
                        `You can disconnect the bot from the voice channel.\n` +
                        `If the target channel doesnt't have a user limit, you can move the bot to the target channel whenever ` +
                        `you want to pull people from the queue (the bot will swap with them). ` +
                        `You can customize how many people the bot will pull each time using ` +
                        `\`${storedPrefix}${Base.getConfig().pullNumCmd} {queue name} {#}\`.`,
                  },
                  {
                     name: "4. Customize",
                     value:
                        `*Privileged* users can customize the command prefix, message color, messaging mode, ` +
                        `and how long people can leave a queue without losing their spot with the commands below.` +
                        `There are also additional commands to do things like shuffling and clearing queues.`,
                  },
                  {
                     name: "Support the Bot :heart:",
                     value:
                        "Hosting isn't free and development takes a lot of time. There are a couple ways to support the bot and future development:\n" +
                        "1. [Review the bot on top.gg](https://top.gg/bot/679018301543677959).\n" +
                        "2. [Buy me a coffee](https://www.buymeacoffee.com/Arroww).",
                  },
               ],
               title: "How to use",
            },
         },
         {
            embed: {
               color: storedColor,
               fields: [
                  {
                     name: "Join Text Queue",
                     value:
                        `\`${storedPrefix}${
                           Base.getConfig().joinCmd
                        } {queue name} {OPTIONAL: message to display next to your name}\` ` +
                        `joins or leaves a text queue.`,
                  },
               ],
               title: "Commands Available to Everyone",
            },
         },
         {
            embed: {
               color: storedColor,
               description:
                  "Commands are available to the server owner, administrators, and users with any of the following roles: `queue mod`, `mod` or `admin`.",
               fields: [
                  {
                     name: "Create / Delete / View Queues",
                     value:
                        `\`${storedPrefix}${Base.getConfig().queueCmd} {channel name} {OPTIONAL: size}\` ` +
                        `creates a new queue or deletes an existing queue.\n` +
                        `\`${storedPrefix}${Base.getConfig().queueCmd}\` shows the existing queues.`,
                  },
                  {
                     name: "Display Queue",
                     value:
                        `\`${storedPrefix}${Base.getConfig().displayCmd} {queue name}\` ` +
                        `displays the members in a queue.These messages stay updated.`,
                  },
                  {
                     name: "Pull from Voice Queue",
                     value:
                        `\`${storedPrefix}${Base.getConfig().startCmd} {queue name}\` adds the bot to a voice queue. ` +
                        `Then the bot can be dragged into another channel to set a "target". ` +
                        `If the target channel has a user limit, ` +
                        `(\`${storedPrefix}${Base.getConfig().limitCmd} {queue name} {#}\`), ` +
                        `the bot will automatically move people from the queue to keep the target channel full. ` +
                        `You can disconnect the bot from the voice channel.\n` +
                        `If the target channel doesnt't have a user limit, you can move the bot to the target channel whenever ` +
                        `you want to pull people from the queue (the bot will swap with them). ` +
                        `You can customize how many people the bot will pull each time using ` +
                        `\`${storedPrefix}${Base.getConfig().pullNumCmd} {queue name} {#}\`.`,
                  },
                  {
                     name: "Pull from Text Queue",
                     value:
                        `\`${storedPrefix}${Base.getConfig().nextCmd} {queue name} {OPTIONAL: #}\` ` +
                        `removes people from the text queue and displays their name.`,
                  },
                  {
                     name: "Kick",
                     value:
                        `\`${storedPrefix}${
                           Base.getConfig().kickCmd
                        } {OPTIONAL: queue name} @{user 1} @{user 2} ...\` ` +
                        `kicks one or more people. If a queue name is given, it will kick from a single queue. ` +
                        `Otherwise, it will kick people from every queue.`,
                  },
                  {
                     name: "Clear",
                     value: `\`${storedPrefix}${Base.getConfig().clearCmd} {queue name}\` clears a queue.`,
                  },
                  {
                     name: "Shuffle",
                     value: `\`${storedPrefix}${Base.getConfig().shuffleCmd} {queue name}\` shuffles a queue.`,
                  },
                  {
                     name: "Set Size Limit",
                     value: `\`${storedPrefix}${Base.getConfig().limitCmd} {queue name} {#}\` sets queue size limit.`,
                  },
                  {
                     name: "Autofill Voice Channels",
                     value: `\`${storedPrefix}${Base.getConfig().autofillCmd} {queue name} {on|off}\`.`,
                  },
                  {
                     name: "Set # of People to Pull at a time",
                     value:
                        `\`${storedPrefix}${Base.getConfig().pullNumCmd} {queue name} {#}\` ` +
                        `sets the default number of people to pull when Autofill is off or when using ` +
                        `\`${storedPrefix}${Base.getConfig().nextCmd}\`.`,
                  },
                  // Server settings
                  {
                     name: "Set Grace Period",
                     value:
                        `\`${storedPrefix}${Base.getConfig().gracePeriodCmd} {# seconds}\` ` +
                        `sets how long a person can leave a queue before being removed.`,
                  },
                  {
                     name: "Set Command Prefix",
                     value: `\`${storedPrefix}${
                        Base.getConfig().prefixCmd
                     } {new prefix}\` sets the prefix for commands.`,
                  },
                  {
                     name: "Set Color",
                     value: `\`${storedPrefix}${
                        Base.getConfig().colorCmd
                     } {new color}\` sets the color of bot messages.`,
                  },
                  {
                     name: "Set Display Mode",
                     value:
                        `\`${storedPrefix}${
                           Base.getConfig().modeCmd
                        } {#}\` sets how the display messages are updated.\n` +
                        `\`${storedPrefix}${Base.getConfig().modeCmd}\` displays the different update modes.`,
                  },
                  {
                     name: "Command Cleanup",
                     value:
                        `\`${storedPrefix}${Base.getConfig().cleanupCmd} {on|off}\` ` +
                        `toggles the cleanup of user-sent Queue Bot commands.`,
                  },
               ],
               image: {
                  url: "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/example.gif",
               },
               title: "Privileged Commands",
            },
         },
      ];

      const channels = message.guild.channels.cache.filter((channel) => channel.type === "text").array() as (
         | TextChannel
         | NewsChannel
      )[];
      const displayChannel = ParsingUtils.extractChannel(channels, parsed, message) as TextChannel | NewsChannel;

      if (parsed.arguments && displayChannel) {
         responses.forEach((response) => SchedulingUtils.scheduleResponseToChannel(response, displayChannel));
      } else {
         // No channel provided. Send help to user.
         responses.forEach((response) => message.author.send(response).catch(() => null));
         const channel = message.channel as TextChannel | NewsChannel;
         MessagingUtils.sendTempMessage("I have sent help to your PMs.", channel, 10);
      }
   }

   /**
    * Kick a member from a queue
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async kickMember(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      // remove user mentions from text
      parsed.arguments = parsed.arguments.replace(/<@!?\d+>/gi, "").trim();
      // Parse members id
      const memberIdsToKick = message.mentions.members.array().map((member) => member.id);
      if (!memberIdsToKick || memberIdsToKick.length === 0) return;
      // Get channels to check - if user provides queue channel, use it. Otherwise check all stored queue channels.
      let queueChannelsToCheck: GuildChannel[] = [];
      if (parsed.arguments) {
         const queueChannel = await ParsingUtils.fetchChannel(
            queueGuild,
            parsed,
            message,
            message.mentions.members.size > 0
         );
         queueChannelsToCheck.push(queueChannel);
      } else {
         const storedQueueChannelIds = await Base.getKnex()<QueueChannel>("queue_channels")
            .where("guild_id", queueGuild.guild_id)
            .pluck("queue_channel_id");
         for (const storedQueueChannelId of storedQueueChannelIds) {
            const queueChannel = message.guild.channels.cache.get(storedQueueChannelId);
            if (queueChannel) {
               queueChannelsToCheck.push(queueChannel);
            }
         }
      }
      // Queue channel found - kick from 1 queue
      for (const queueChannel of queueChannelsToCheck) {
         const storedQueueMemberIds = await Base.getKnex()<QueueMember>("queue_members")
            .where("queue_channel_id", queueChannel.id)
            .whereIn("queue_member_id", memberIdsToKick)
            .pluck("queue_member_id");
         if (!storedQueueMemberIds || storedQueueMemberIds.length === 0) continue;
         // Remove from queue
         if (queueChannel.type === "voice") {
            const members = [];
            for (const id of storedQueueMemberIds) {
               const member = queueChannel.members.get(id);
               if (member) {
                  members.push(member);
               }
            }
            for (const member of members) {
               member?.voice?.kick().catch(() => null);
            }
         } else {
            await Base.getKnex()<QueueMember>("queue_members")
               .whereIn("queue_member_id", memberIdsToKick)
               .where("queue_channel_id", queueChannel.id)
               .del();
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel as TextChannel | NewsChannel | VoiceChannel);
         }
         SchedulingUtils.scheduleResponseToMessage(
            "Kicked " +
               storedQueueMemberIds.map((id) => `<@!${id}>`).join(", ") +
               ` from the \`${queueChannel.name}\` queue.`,
            message
         );
      }
   }

   /**
    * Set a server setting
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    * @param passesValueRestrictions Test to determine whether the user input is valid.
    * @param extraErrorLine Extra hint to display if the user gives invalid input.
    * @param embed Embed to display with extra error line.
    */
   public static async setServerSetting(
      queueGuild: QueueGuild,
      parsed: ParsedArguments,
      message: Message,
      passesValueRestrictions: boolean,
      extraErrorLine?: string,
      embed?: Partial<MessageEmbedOptions>
   ): Promise<void> {
      // Setup common variables
      const setting = this.serverSettingVariables[parsed.command];
      const channels = await QueueChannelTable.fetchStoredQueueChannels(message.guild);

      if (parsed.arguments && passesValueRestrictions) {
         // Store channel to database
         await Base.getKnex()<QueueGuild>("queue_guilds")
            .where("guild_id", message.guild.id)
            .first()
            .update(setting.dbVariable, parsed.arguments);
         queueGuild[setting.dbVariable] = parsed.arguments;
         SchedulingUtils.scheduleResponseToMessage(
            `Set \`${setting.label.toLowerCase()}\` to \`${parsed.arguments}\`.`,
            message
         );
         for (const channel of channels) {
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, channel);
         }
      } else {
         SchedulingUtils.scheduleResponseToMessage(
            {
               content:
                  `${setting.label} is \`${queueGuild[setting.dbVariable]}\`.\n` +
                  `Set using \`${queueGuild.prefix}${parsed.command} {${setting.options}}\`.\n` +
                  (extraErrorLine ? extraErrorLine : ""),
               embed,
            },
            message
         );
      }
   }

   /**
    * Toggle a channel's queue status. Display existing queues if no argument is provided.
    * @param queueGuild
    * @param parsed Parsed message - prefix, command, argument.
    * @param message Discord message object.
    */
   public static async setQueueChannel(
      queueGuild: QueueGuild,
      parsed: ParsedArguments,
      message: Message
   ): Promise<void> {
      // Get stored queue channel list from database
      const storedChannels = await QueueChannelTable.fetchStoredQueueChannels(message.guild);
      // Channel argument provided. Toggle it
      if (parsed.arguments) {
         const channels = message.guild.channels.cache.filter((channel) => channel.type !== "category").array() as (
            | VoiceChannel
            | TextChannel
            | NewsChannel
         )[];
         const queueChannel = ParsingUtils.extractChannel(channels, parsed, message);
         if (!queueChannel) {
            ParsingUtils.reportChannelNotFound(queueGuild, parsed, channels, message, false, false);
            return;
         }

         if (storedChannels.some((storedChannel) => storedChannel.id === queueChannel.id)) {
            // Channel is already stored, remove it
            await QueueChannelTable.unstoreQueueChannel(message.guild.id, queueChannel.id);
            if (queueChannel.type === "voice") {
               if (queueChannel.userLimit > 0) {
                  (queueChannel as VoiceChannel).setUserLimit(0).catch(() => null);
               }
            }
            SchedulingUtils.scheduleResponseToMessage(`Deleted queue for \`${queueChannel.name}\`.`, message);
         } else {
            // Get number of users to pop
            let maxMembersInQueue = ParsingUtils.getTailingNumberFromString(message, parsed.arguments);
            if (!maxMembersInQueue && queueChannel["userLimit"]) {
               maxMembersInQueue = queueChannel["userLimit"];
            }
            if (queueChannel.type === "voice") {
               if (queueChannel.permissionsFor(message.guild.me).has("CONNECT")) {
                  if (maxMembersInQueue) {
                     if (maxMembersInQueue > 99) {
                        SchedulingUtils.scheduleResponseToMessage(`Max \`amount\` is 99. Using 99.`, message);
                        maxMembersInQueue = 99;
                     }
                     if (queueChannel.permissionsFor(message.guild.me).has("MANAGE_CHANNELS")) {
                        (queueChannel as VoiceChannel).setUserLimit(maxMembersInQueue).catch(() => null);
                     } else {
                        SchedulingUtils.scheduleResponseToMessage(
                           "I can automatically set voice channel user limits, but I need a new permission.\n" +
                              "I can be given permission in `Server Settings` > `Roles` > `Queue Bot` > enable `Manage Channels`.",
                           message
                        );
                     }
                  }
               } else {
                  SchedulingUtils.scheduleResponseToMessage(
                     `I need the **CONNECT** permission in the \`${queueChannel.name}\` voice channel to pull in queue members.`,
                     message
                  );
               }
            }
            // It's not in the list, add it
            await QueueChannelTable.storeQueueChannel(queueChannel, maxMembersInQueue);
            await this.displayQueue(queueGuild, parsed, message, queueChannel);
         }
      } else {
         // No argument. Display current queues
         if (storedChannels.length > 0) {
            SchedulingUtils.scheduleResponseToMessage(
               `Current queues: ${storedChannels.map((ch) => ` \`${ch.name}\``)}`,
               message
            );
         } else {
            SchedulingUtils.scheduleResponseToMessage(
               `No queue channels set.\n` +
                  `Set a new queue channel using \`${queueGuild.prefix}${Base.getConfig().queueCmd} {channel name}\`\n`,
               // 	+ `Channels: ${channels.map(channel => ` \`${channel.name}\``)}`
               message
            );
         }
      }
   }

   /**
    * Add a member into a text queue
    * @param queueGuild
    * @param parsed Parsed message - prefix, command, argument.
    * @param message Discord message object.
    * @param authorHasPermissionToQueueOthers whether the message author can queue others using mentions.
    */
   public static async joinTextChannel(
      queueGuild: QueueGuild,
      parsed: ParsedArguments,
      message: Message,
      authorHasPermissionToQueueOthers: boolean
   ): Promise<void> {
      const queueChannel = await ParsingUtils.fetchChannel(
         queueGuild,
         parsed,
         message,
         message.mentions.members.size > 0,
         "text"
      );
      if (!queueChannel) return;

      const storedQueueChannel = await Base.getKnex()<QueueChannel>("queue_channels")
         .where("queue_channel_id", queueChannel.id)
         .first();
      const storedQueueMembers = await Base.getKnex()<QueueMember>("queue_members").where(
         "queue_channel_id",
         queueChannel.id
      );

      // Parse members
      let memberIdsToToggle = [message.member.id];
      if (authorHasPermissionToQueueOthers && message.mentions.members.size > 0) {
         memberIdsToToggle = message.mentions.members.array().map((member) => member.id);
      }

      const memberIdsToAdd: string[] = [];
      const memberIdsToRemove: string[] = [];
      for (const memberId of memberIdsToToggle) {
         if (storedQueueMembers.some((storedMember) => storedMember.queue_member_id === memberId)) {
            // Already in queue, set to remove
            memberIdsToRemove.push(memberId);
         } else {
            // Not in queue, set to add
            if (storedQueueChannel?.max_members && storedQueueMembers.length >= +storedQueueChannel.max_members) {
               const channel = message.channel as TextChannel | NewsChannel;
               MessagingUtils.sendTempMessage(
                  `Failed to join. ` +
                     `\`${
                        queueChannel.name
                     }\` queue is full (${+storedQueueChannel.max_members}/${+storedQueueChannel.max_members}).`,
                  channel,
                  10
               );
            } else {
               memberIdsToAdd.push(memberId);
            }
         }
      }
      let response = "";
      if (memberIdsToRemove.length > 0) {
         // Remove from queue
         await QueueMemberTable.unstoreQueueMembers(queueChannel.id, memberIdsToRemove);
         response +=
            "Removed " +
            memberIdsToRemove.map((id) => `<@!${id}>`).join(", ") +
            ` from the \`${queueChannel.name}\` queue.\n`;
      }
      if (memberIdsToAdd.length > 0) {
         // Parse message
         const personalMessage = parsed.arguments
            .replace(/(<(@!?|#)\w+>)/gi, "")
            .replace(queueChannel.name, "")
            .substring(0, 128)
            .trim();
         // Add to queue
         await QueueMemberTable.storeQueueMembers(queueChannel.id, memberIdsToAdd, personalMessage);
         response +=
            "Added " + memberIdsToAdd.map((id) => `<@!${id}>`).join(", ") + ` to the \`${queueChannel.name}\` queue.`;
      }
      SchedulingUtils.scheduleResponseToMessage(response, message);
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
   }

   /**
    * Pop a member from a text channel queue
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async popTextQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message, false);
      if (!queueChannel) return;
      const storedQueueChannel = await Base.getKnex()<QueueChannel>("queue_channels")
         .where("queue_channel_id", queueChannel.id)
         .first();
      if (!storedQueueChannel) return;

      // Get number of users to pop
      const numToPop =
         ParsingUtils.getTailingNumberFromString(message, parsed.arguments) || storedQueueChannel.pull_num;

      // Get the oldest member entry for the queue
      let nextQueueMembers = await Base.getKnex()<QueueMember>("queue_members")
         .where("queue_channel_id", queueChannel.id)
         .orderBy("created_at");
      nextQueueMembers = nextQueueMembers.slice(0, numToPop);

      if (nextQueueMembers.length > 0) {
         // Display and remove member from the the queue
         SchedulingUtils.scheduleResponseToMessage(
            `Pulled ` +
               nextQueueMembers.map((member) => `<@!${member.queue_member_id}>`).join(", ") +
               ` from \`${queueChannel.name}\`.`,
            message
         );
         await QueueMemberTable.unstoreQueueMembers(
            queueChannel.id,
            nextQueueMembers.map((member) => member.queue_member_id)
         );
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      } else {
         SchedulingUtils.scheduleResponseToMessage(`\`${queueChannel.name}\` is empty.`, message);
      }
   }

   /**
    * Shuffles a queue
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async shuffleQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message);
      if (!queueChannel) return;

      const queueMembers = await Base.getKnex()<QueueMember>("queue_members").where(
         "queue_channel_id",
         queueChannel.id
      );
      const queueMemberTimeStamps = queueMembers.map((member) => member.created_at);
      this.shuffleArray(queueMemberTimeStamps);
      for (let i = 0; i < queueMembers.length; i++) {
         await Base.getKnex()<QueueMember>("queue_members")
            .where("id", queueMembers[i].id)
            .update("created_at", queueMemberTimeStamps[i]);
      }
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      const channel = message.channel as TextChannel | NewsChannel;
      MessagingUtils.sendTempMessage(`\`${queueChannel.name}\` queue shuffled.`, channel, 10);
   }

   /**
    * Pop a member from a text channel queue
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async clearQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message);
      if (!queueChannel) return;

      await QueueMemberTable.unstoreQueueMembers(queueChannel.id);
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      SchedulingUtils.scheduleResponseToMessage(`\`${queueChannel.name}\` queue cleared.`, message);
   }

   /**
    * Add bot to a voice channel for swapping
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async start(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message, false, "voice");
      if (!queueChannel) return;

      if (queueChannel.type === "voice") {
         if (queueChannel.permissionsFor(message.guild.me).has("CONNECT")) {
            if (!queueChannel.full) {
               queueChannel
                  .join()
                  .then((connection) => {
                     if (connection) {
                        connection.on("warn", () => null);
                        connection.on("error", () => null);
                        connection.on("failed", () => null);
                        connection.on("uncaughtException", () => null);
                        connection.voice?.setSelfDeaf(true);
                        connection.voice?.setSelfMute(true);
                     }
                  })
                  .catch(() => null);
            } else {
               SchedulingUtils.scheduleResponseToMessage(
                  `I can't join ${queueChannel.name} because it is full`,
                  message
               );
            }
         } else {
            SchedulingUtils.scheduleResponseToMessage(`I don't have permission to join ${queueChannel.name}!`, message);
         }
      } else {
         SchedulingUtils.scheduleResponseToMessage("I can only join voice channels.", message);
      }
   }

   /**
    * Set voice channel limits command
    * @param queueGuild
    * @param parsed Parsed message - prefix, command, argument.
    * @param message Discord message object.
    */
   public static async setSizeLimit(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message);
      if (!queueChannel) return;

      let maxMembersInQueue = ParsingUtils.getTailingNumberFromString(message, parsed.arguments);
      if (maxMembersInQueue) {
         if (queueChannel.type === "voice") {
            if (maxMembersInQueue > 99) {
               const channel = message.channel as TextChannel | NewsChannel;
               MessagingUtils.sendTempMessage(`Max \`amount\` is 99. Using 99.`, channel, 10);
               maxMembersInQueue = 99;
            }
            if (queueChannel.permissionsFor(message.guild.me).has("MANAGE_CHANNELS")) {
               (queueChannel as VoiceChannel).setUserLimit(maxMembersInQueue).catch(() => null);
            } else {
               SchedulingUtils.scheduleResponseToMessage(
                  "I can automatically set voice channel user limits, but I need a new permission.\n" +
                     "I can be given permission in `Server Settings` > `Roles` > `Queue Bot` > enable `Manage Channels`.",
                  message
               );
            }
         }
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
         await Base.getKnex()<QueueChannel>("queue_channels")
            .where("queue_channel_id", queueChannel.id)
            .update("max_members", maxMembersInQueue);
      }
   }

   /**
    *
    * @param queueGuild
    * @param parsed
    * @param message
    */
   public static async setAutoFill(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const queueChannel = (await ParsingUtils.fetchChannel(queueGuild, parsed, message)) as VoiceChannel;
      if (!queueChannel) return;
      if (queueChannel.type !== "voice") {
         const channel = message.channel as TextChannel | NewsChannel;
         MessagingUtils.sendTempMessage(
            `\`${queueGuild.prefix}${Base.getConfig().autofillCmd}\` can only be used on voice channels.`,
            channel,
            10
         );
         return;
      }

      const statusString = parsed.arguments
         .replace(/(<(@!?|#)\w+>)/gi, "")
         .replace(queueChannel.name, "")
         .toLowerCase()
         .trim();
      const storedQueueChannel = await Base.getKnex()<QueueChannel>("queue_channels")
         .where("queue_channel_id", queueChannel.id)
         .first();
      if (statusString) {
         if (statusString === "on") {
            SchedulingUtils.scheduleResponseToMessage(`Set autofill for \`${queueChannel.name}\` to \`ON\`.`, message);
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
            await Base.getKnex()<QueueChannel>("queue_channels")
               .where("queue_channel_id", queueChannel.id)
               .update("auto_fill", 1);
         } else if (statusString === "off") {
            SchedulingUtils.scheduleResponseToMessage(
               `Set autofill for \`${queueChannel.name}\` to \`OFF\`.\n` +
                  `Queue Bot will pull \`${storedQueueChannel.pull_num}\` at a time. ` +
                  `You can set this amount \`${queueGuild.prefix}${Base.getConfig().pullNumCmd} {queue name} {#}\`.`,
               message
            );
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
            await Base.getKnex()<QueueChannel>("queue_channels")
               .where("queue_channel_id", queueChannel.id)
               .update("auto_fill", 0);
            await Base.getKnex()<QueueChannel>("queue_channels")
               .where("queue_channel_id", queueChannel.id)
               .update("target_channel_id", Base.getKnex().raw("DEFAULT"));
         } else {
            const channel = message.channel as TextChannel | NewsChannel;
            MessagingUtils.sendTempMessage(
               `\`${queueGuild.prefix}${Base.getConfig().autofillCmd}\` argument must be \`ON\` or \`OFF\`.`,
               channel,
               10
            );
         }
      } else {
         SchedulingUtils.scheduleResponseToMessage(
            `Autofill for \`${queueChannel.name}\` is ` +
               (storedQueueChannel.auto_fill
                  ? "`ON`"
                  : `\`OFF\`.\nQueue Bot will pull \`${storedQueueChannel.pull_num}\` at a time.`),
            message
         );
      }
   }

   /**
    *
    * @param queueGuild
    * @param parsed
    * @param message
    */
   public static async setPullNum(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      // Get queue channel
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message);
      if (!queueChannel) return;

      let pullNum = ParsingUtils.getTailingNumberFromString(message, parsed.arguments);
      if (pullNum) {
         if (pullNum > 99) {
            SchedulingUtils.scheduleResponseToMessage(`\`amount\` must be between 1 and 99`, message);
         } else {
            await Base.getKnex()<QueueChannel>("queue_channels")
               .where("queue_channel_id", queueChannel.id)
               .update("pull_num", pullNum);
            SchedulingUtils.scheduleResponseToMessage(
               `Set pull number for \`${queueChannel.name}\` to \`${pullNum}\``,
               message
            );
         }
      } else if (pullNum != undefined) {
         const storedQueueChannel = await Base.getKnex()<QueueChannel>("queue_channels")
            .where("queue_channel_id", queueChannel.id)
            .first();
         SchedulingUtils.scheduleResponseToMessage(
            `Autofill for \`${queueChannel.name}\` is ${storedQueueChannel.auto_fill ? "`ON`" : "`OFF`"}.\n` +
               `Queue Bot will pull \`${storedQueueChannel.pull_num}\` at a time.`,
            message
         );
      }
   }

   // Map commands to database columns and display strings
   private static serverSettingVariables = {
      [Base.getConfig().gracePeriodCmd]: { dbVariable: "grace_period", label: "Grace period", options: "grace period" },
      [Base.getConfig().prefixCmd]: { dbVariable: "prefix", label: "Prefix", options: "prefix" },
      [Base.getConfig().colorCmd]: { dbVariable: "color", label: "Color", options: "color" },
      [Base.getConfig().cleanupCmd]: { dbVariable: "cleanup_commands", label: "Cleanup", options: "on|off" },
      [Base.getConfig().modeCmd]: { dbVariable: "msg_mode", label: "Message mode", options: "message mode" },
   };

   /**
    * Shuffle using the Fisher-Yates algorithm
    * @param array items to shuffle
    */
   private static shuffleArray(array: string[]): void {
      for (let i = array.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [array[i], array[j]] = [array[j], array[i]];
      }
   }
}
