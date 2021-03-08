import { GuildChannel, MessageEmbed, MessageEmbedOptions, MessageOptions, NewsChannel, TextChannel, VoiceChannel } from "discord.js";
import { MemberPerm, ParsedArguments, QueueMember } from "./utilities/Interfaces";
import { Base } from "./utilities/Base";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { ParsingUtils } from "./utilities/ParsingUtils";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { SchedulingUtils } from "./utilities/SchedulingUtils";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { MemberPermsTable } from "./utilities/tables/MemberPermsTable";

export class Commands {
   /**
    * Create an embed message to display a channel's queue
    */
   public static async displayQueue(parsed: ParsedArguments, queueChannel?: VoiceChannel | TextChannel | NewsChannel): Promise<void> {
      queueChannel = queueChannel || (await ParsingUtils.getStoredChannel(parsed));
      if (!queueChannel) return;

      const displayChannel = parsed.message.channel as TextChannel | NewsChannel;
      const displayPermissions = displayChannel.permissionsFor(displayChannel.guild.me);
      if (displayPermissions.has("SEND_MESSAGES") && displayPermissions.has("EMBED_LINKS")) {
         const embeds = await MessagingUtils.generateEmbed(parsed.queueGuild, queueChannel);
         // Remove old display
         await DisplayChannelTable.unstoreDisplayChannel(queueChannel.id, displayChannel.id);
         // Create new display
         await DisplayChannelTable.storeDisplayChannel(queueChannel, displayChannel, embeds);
      } else {
         parsed.message.author
            .send(`I don't have permission to write messages and embeds in \`${displayChannel.name}\`.`)
            .catch(() => null);
      }
   }

   /**
    * Send a help embed
    */
   public static async help(parsed: ParsedArguments): Promise<void> {
      const storedPrefix = parsed.queueGuild.prefix;
      const storedColor = parsed.queueGuild.color;

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
                  "*Privileged* users are the server owner, administrators, and users with any of the following roles: `mod`, `moderator`, `admin`, `administrator`.\n" +
                  "If a command that expects a channel name is not given one, the current text channel will be used.",
               fields: [
                  {
                     name: "1. Create a Queue",
                     value:
                        `*Privileged* users can create queues with ` +
                        `\`${storedPrefix}${Base.getCmdConfig().queueCmd} {channel name}\` ` +
                        `where \`{channel name}\` is the name of a text or voice channels. For example, ` +
                        `\`${storedPrefix}${Base.getCmdConfig().queueCmd} Waiting Room\` ` +
                        `turns the Waiting Room voice channel into a queue.`,
                  },
                  {
                     name: "2. Join a Queue",
                     value:
                        `Any user can join text queues by clicking the queue reaction or with ` +
                        `\`${storedPrefix}${Base.getCmdConfig().joinCmd} {queue name}\`. ` +
                        `Any user can join voice queues by joining the matching voice channel.`,
                  },
                  {
                     name: "3. Pull Users From a Queue",
                     value:
                        `**TEXT**: *Privileged* users can be pulled from a text queue with ` +
                        `\`${storedPrefix}${Base.getCmdConfig().nextCmd} {queue name}\`.\n` +
                        `**VOICE**: Pulling users from voice queues requires 2 steps:\n` +
                        `1. \`${storedPrefix}${Base.getCmdConfig().startCmd} {queue name}\` ` +
                        `makes the bot join the voice channel.\n` +
                        `2. Move the bot to a new (non-queue) channel to set a "target".\n` +
                        `If the target channel has a user limit, ` +
                        `(\`${storedPrefix}${Base.getCmdConfig().limitCmd} {queue name} {#}\`), ` +
                        `the bot will automatically move people from the queue to keep the target channel full. ` +
                        `You can disconnect the bot from the voice channel.\n` +
                        `If the target channel doesnt't have a user limit, you can move the bot to the target channel whenever ` +
                        `you want to pull people from the queue (the bot will swap with them). ` +
                        `You can customize how many people the bot will pull each time using ` +
                        `\`${storedPrefix}${Base.getCmdConfig().pullNumCmd} {queue name} {#}\`.`,
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
               description: "If a command that expects a channel name is not given one, the current text channel will be used.",
               fields: [
                  {
                     name: "Join Text Queue",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().joinCmd} {queue name} {OPTIONAL: message to display next to your name}\` ` +
                        `joins or leaves a text queue.`,
                  },
                  {
                     name: "My Queues",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().myQueuesCmd}\` ` +
                        `display a member's position in each of the queue they have joined.`,
                  },
               ],
               title: "Commands Available to Everyone",
            },
         },
         {
            embed: {
               color: storedColor,
               description:
                  "Commands available to the server owner, administrators, and users with any of the following roles: `queue mod`, `mod` or `admin`.\n" +
                  "If a command that expects a channel name is not given one, the current text channel will be used.",
               fields: [
                  {
                     name: "Create / View Queues",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().queueCmd} {channel name} {OPTIONAL: size}\` ` +
                        `creates a new queue.\n` +
                        `\`${storedPrefix}${Base.getCmdConfig().queueCmd}\` shows the existing queues.`,
                  },
                  {
                     name: "Delete Queues",
                     value: `\`${storedPrefix}${Base.getCmdConfig().queueDeleteCmd} {queue name}\` ` + `deletes an existing queue.\n`,
                  },
                  {
                     name: "Display Queue",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().displayCmd} {queue name}\` ` +
                        `displays the members in a queue.These messages stay updated.`,
                  },
                  {
                     name: "Pull from Voice Queue",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().startCmd} {queue name}\` adds the bot to a voice queue. ` +
                        `Then the bot can dragged to a (non-queue) channel to set a "target". ` +
                        `If the target channel has a user limit, ` +
                        `(\`${storedPrefix}${Base.getCmdConfig().limitCmd} {queue name} {#}\`), ` +
                        `the bot will automatically move people from the queue to keep the target channel full. ` +
                        `You can disconnect the bot from the voice channel.\n` +
                        `If the target channel doesnt't have a user limit, you can move the bot to the target channel whenever ` +
                        `you want to pull people from the queue (the bot will swap with them). ` +
                        `You can customize how many people the bot will pull each time using ` +
                        `\`${storedPrefix}${Base.getCmdConfig().pullNumCmd} {queue name} {#}\`.`,
                  },
                  {
                     name: "Pull from Text Queue",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().nextCmd} {queue name} {OPTIONAL: #}\` ` +
                        `removes people from the text queue and displays their name.`,
                  },
                  {
                     name: "Kick",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().kickCmd} {OPTIONAL: queue name} @{user 1} @{user 2} ...\` ` +
                        `kicks one or more people. If a queue name is given, it will kick from a single queue. ` +
                        `Otherwise, it will kick people from every queue.`,
                  },
                  {
                     name: "Clear",
                     value: `\`${storedPrefix}${Base.getCmdConfig().clearCmd} {queue name}\` clears a queue.`,
                  },
                  {
                     name: "Shuffle",
                     value: `\`${storedPrefix}${Base.getCmdConfig().shuffleCmd} {queue name}\` shuffles a queue.`,
                  },
                  {
                     name: "Set Size Limit",
                     value: `\`${storedPrefix}${Base.getCmdConfig().limitCmd} {queue name} {#}\` sets queue size limit.`,
                  },
                  {
                     name: "Autofill Voice Channels",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().autofillCmd} {queue name} {on|off}\` ` +
                        `turns autofill on or off for a channel.`,
                  },
                  {
                     name: "Set # of People to Pull at a time",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().pullNumCmd} {queue name} {#}\` ` +
                        `sets the default number of people to pull when Autofill is off or when using ` +
                        `\`${storedPrefix}${Base.getCmdConfig().nextCmd}\`.`,
                  },
                  {
                     name: "Set Display Message Header",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().headerCmd} {queue name} {message}\` ` +
                        `sets a header for display messaged. Leave \`{header}\` blank to remove.`,
                  },
                  {
                     name: "Mention Queue",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().mentionCmd} {queue name} {OPTIONAL: message}\` ` +
                        `mentions everyone in a queue. You can add a message too.`,
                  },
                  {
                     name: "Blacklist",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().blacklistCmd} {queue name} @{user 1} @{user 2} ...\` ` +
                        `blacklists users from a queue. Use again to remove them from a blacklist.\n` +
                        `\`${storedPrefix}${Base.getCmdConfig().blacklistCmd} {queue name}\` ` +
                        `displays a queue's blacklist.`,
                  },
                  // Server settings
                  {
                     name: "Set Grace Period",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().gracePeriodCmd} {# seconds}\` ` +
                        `sets how long a person can leave a queue before being removed.`,
                  },
                  {
                     name: "Set Command Prefix",
                     value: `\`${storedPrefix}${Base.getCmdConfig().prefixCmd} {new prefix}\` sets the prefix for commands.`,
                  },
                  {
                     name: "Set Color",
                     value: `\`${storedPrefix}${Base.getCmdConfig().colorCmd} {new color}\` sets the color of bot messages.`,
                  },
                  {
                     name: "Set Display Mode",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().modeCmd} {#}\` sets how the display messages are updated.\n` +
                        `\`${storedPrefix}${Base.getCmdConfig().modeCmd}\` displays the different update modes.`,
                  },
                  {
                     name: "Command Cleanup",
                     value:
                        `\`${storedPrefix}${Base.getCmdConfig().cleanupCmd} {on|off}\` ` +
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

      const channels = parsed.message.guild.channels.cache.filter((channel) => channel.type === "text").array() as (
         | TextChannel
         | NewsChannel
      )[];
      const displayChannel = ParsingUtils.getChannel(parsed, channels) as TextChannel | NewsChannel;
      if (parsed.arguments && displayChannel) {
         responses.forEach((response) => SchedulingUtils.scheduleResponseToChannel(response, displayChannel));
      } else {
         // No channel provided. Send help to user.
         responses.forEach((response) => parsed.message.author.send(response).catch(() => null));
         const channel = parsed.message.channel as TextChannel | NewsChannel;
         MessagingUtils.sendTempMessage("I have sent help to your PMs.", channel, 10);
      }
   }

   /**
    * Kick a member from a queue
    */
   public static async kickMember(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      // remove user mentions from text
      parsed.arguments = parsed.arguments.replaceAll(/<@!?\d+>/gi, "").trim();
      // Parse members id
      const memberIdsToKick = message.mentions.members.array().map((member) => member.id);
      if (memberIdsToKick.length === 0) return;
      // Get channels to check - if user provides queue channel, use it. Otherwise check all stored queue channels.
      let queueChannelsToCheck: GuildChannel[] = [];
      if (parsed.arguments) {
         const queueChannel = await ParsingUtils.getStoredChannel(parsed, message.mentions.members.size > 0);
         if (queueChannel) queueChannelsToCheck.push(queueChannel);
      } else {
         queueChannelsToCheck = await QueueChannelTable.getFromGuild(message.guild);
      }
      // Queue channel found - kick from 1 queue
      for (const queueChannel of queueChannelsToCheck) {
         const storedQueueMemberIds = await QueueMemberTable.getMany(queueChannel.id, memberIdsToKick).pluck("queue_member_id");
         if (!storedQueueMemberIds || storedQueueMemberIds.length === 0) continue;
         // Remove from queue
         if (queueChannel.type === "voice") {
            for (const id of storedQueueMemberIds) {
               const member = await queueChannel.guild.members.fetch(id);
               member?.voice?.kick().catch(() => null);
            }
         } else {
            await QueueMemberTable.getMany(queueChannel.id, memberIdsToKick).del();
            SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel as TextChannel | NewsChannel | VoiceChannel);
         }
         SchedulingUtils.scheduleResponseToMessage(
            "Kicked " + storedQueueMemberIds.map((id) => `<@!${id}>`).join(", ") + ` from the \`${queueChannel.name}\` queue.`,
            message
         );
      }
   }

   /**
    * Set a server setting
    * @param passesValueRestrictions Test to determine whether the user input is valid.
    * @param extraErrorLine Extra hint to display if the user gives invalid input.
    * @param embed Embed to display with extra error line.
    */
   public static async setServerSetting(
      parsed: ParsedArguments,
      passesValueRestrictions: boolean,
      extraErrorLine?: string,
      embed?: Partial<MessageEmbedOptions>
   ): Promise<void> {
      // Setup common variables
      const message = parsed.message;
      const queueGuild = parsed.queueGuild;
      const setting = this.serverSettingVariables[parsed.command];
      const channels = await QueueChannelTable.getFromGuild(message.guild);

      if (parsed.arguments && passesValueRestrictions) {
         // Store channel to database
         await QueueGuildTable.get(message.guild.id).update(setting.dbVariable, parsed.arguments);
         queueGuild[setting.dbVariable] = parsed.arguments;
         SchedulingUtils.scheduleResponseToMessage(`Set \`${setting.label.toLowerCase()}\` to \`${parsed.arguments}\`.`, message);
         for (const channel of channels) {
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, channel);
         }
      } else {
         SchedulingUtils.scheduleResponseToMessage(
            {
               content:
                  `${setting.label} is \`${queueGuild[setting.dbVariable] || "off"}\`.\n` +
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
    */
   public static async setQueue(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      const queueGuild = parsed.queueGuild;
      // Get stored queue channel list from database
      const storedChannels = await QueueChannelTable.getFromGuild(message.guild);
      // Channel argument provided. Toggle it
      if (parsed.arguments) {
         const channels = message.guild.channels.cache.filter((channel) => channel.type !== "category").array() as (
            | TextChannel
            | NewsChannel
            | VoiceChannel
         )[];
         const channel = ParsingUtils.getChannel(parsed, channels);
         if (!channel) return;

         if (storedChannels.some((storedChannel) => storedChannel.id === channel.id)) {
            // Channel is already stored, remove it
            SchedulingUtils.scheduleResponseToMessage(`\`${channel.name}\` is already a queue.`, message);
         } else {
            // Get number of users to pop
            let maxMembersInQueue = ParsingUtils.getTailingNumberFromString(message, parsed.arguments);
            if (!maxMembersInQueue && channel["userLimit"]) {
               maxMembersInQueue = channel["userLimit"];
            }
            if (channel.type === "voice") {
               if (channel.permissionsFor(message.guild.me).has("CONNECT")) {
                  if (maxMembersInQueue) {
                     if (maxMembersInQueue > 99) {
                        SchedulingUtils.scheduleResponseToMessage(`Max \`amount\` is 99. Using 99.`, message);
                        maxMembersInQueue = 99;
                     }
                     if (channel.permissionsFor(message.guild.me).has("MANAGE_CHANNELS")) {
                        (channel as VoiceChannel).setUserLimit(maxMembersInQueue).catch(() => null);
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
                     `I need the **CONNECT** permission in the \`${channel.name}\` voice channel to pull in queue members.`,
                     message
                  );
               }
            }
            // It's not in the list, add it
            await QueueChannelTable.storeQueueChannel(channel, maxMembersInQueue);
            await this.displayQueue(parsed, channel);
         }
      } else {
         // No argument. Display current queues
         if (storedChannels.length > 0) {
            SchedulingUtils.scheduleResponseToMessage(`Current queues: ${storedChannels.map((ch) => ` \`${ch.name}\``)}`, message);
         } else {
            SchedulingUtils.scheduleResponseToMessage(
               `No queue channels set.\n` +
                  `Set a new queue channel using ` +
                  `\`${queueGuild.prefix}${Base.getCmdConfig().queueCmd} {channel name}\``,
               message
            );
         }
      }
   }

   /**
    *
    */
   public static async queueDelete(parsed: ParsedArguments) {
      if (!parsed.arguments) {
         SchedulingUtils.scheduleResponseToMessage(
            `Must provide queue name. ` + `\`${parsed.queueGuild.prefix}${Base.getCmdConfig().queueDeleteCmd} {queue name}\`.`,
            parsed.message
         );
         return;
      }

      const queueChannel = await ParsingUtils.getStoredChannel(parsed);
      if (!queueChannel) return;

      // Channel is already stored, remove it
      await QueueChannelTable.unstoreQueueChannel(parsed.message.guild.id, queueChannel.id);
      if (queueChannel.type === "voice") {
         if (queueChannel.userLimit > 0) {
            (queueChannel as VoiceChannel).setUserLimit(0).catch(() => null);
         }
      }
      SchedulingUtils.scheduleResponseToMessage(`Deleted queue for \`${queueChannel.name}\`.`, parsed.message);
   }

   /**
    * Add a member into a text queue
    * @param authorHasPermissionToQueueOthers whether the message author can queue others using mentions.
    */
   public static async joinTextChannel(parsed: ParsedArguments, authorHasPermissionToQueueOthers: boolean): Promise<void> {
      const message = parsed.message;
      const queueChannel = await ParsingUtils.getStoredChannel(parsed, message.mentions.members.size > 0, "text");
      if (!queueChannel) return;

      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      const storedQueueMembers = await QueueMemberTable.getFromQueue(queueChannel.id);

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
         } else if (!(await MemberPermsTable.isBlacklisted(queueChannel.id, memberId))) {
            // Not in queue, set to add
            if (storedQueueChannel?.max_members && storedQueueMembers.length >= +storedQueueChannel.max_members) {
               const channel = message.channel as TextChannel | NewsChannel;
               MessagingUtils.sendTempMessage(
                  `Failed to join. \`${queueChannel.name}\` ` +
                     `queue is full (${+storedQueueChannel.max_members} /${+storedQueueChannel.max_members}).`,
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
         response += "Removed " + memberIdsToRemove.map((id) => `<@!${id}>`).join(", ") + ` from the \`${queueChannel.name}\` queue.\n`;
      }
      if (memberIdsToAdd.length > 0) {
         // Parse message
         const personalMessage = MessagingUtils.removeMentions(parsed.arguments, queueChannel).substring(0, 128);
         // Add to queue
         await QueueMemberTable.storeQueueMembers(queueChannel.id, memberIdsToAdd, personalMessage);
         response += "Added " + memberIdsToAdd.map((id) => `<@!${id}>`).join(", ") + ` to the \`${queueChannel.name}\` queue.`;
      }
      SchedulingUtils.scheduleResponseToMessage(response, message);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   /**
    * Pop a member from queue
    */
   public static async next(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      const queueChannel = await ParsingUtils.getStoredChannel(parsed, false);
      if (!queueChannel) return;
      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      if (!storedQueueChannel) return;

      // Get number of users to pop
      const numToPop = ParsingUtils.getTailingNumberFromString(message, parsed.arguments) || storedQueueChannel.pull_num;

      // Get the oldest member entry for the queue
      let nextQueueMembers = await QueueMemberTable.getFromQueue(queueChannel.id).orderBy("created_at");
      nextQueueMembers = nextQueueMembers.slice(0, numToPop);

      if (nextQueueMembers.length > 0) {
         // Display and remove member from the the queue
         if (queueChannel.type === "voice") {
            for (const nextMember of nextQueueMembers) {
               const member = message.guild.members.cache.get(nextMember.queue_member_id);
               const targetChannel = message.guild.channels.cache.get(storedQueueChannel.target_channel_id) as VoiceChannel;
               if (targetChannel) {
                  SchedulingUtils.scheduleMoveMember(member.voice, targetChannel);
                  await parsed.message.react("✅").catch(() => null);
               } else {
                  SchedulingUtils.scheduleResponseToMessage(
                     `Set a target channel by sending \`${parsed.queueGuild.prefix}${Base.getCmdConfig().startCmd}\` ` +
                        `then dragging the bot to the target channel.`,
                     message
                  );
                  return;
               }
            }
         } else {
            SchedulingUtils.scheduleResponseToMessage(
               `Pulled ` + nextQueueMembers.map((member) => `<@!${member.queue_member_id}>`).join(", ") + ` from \`${queueChannel.name}\`.`,
               message
            );
            for (const member of nextQueueMembers) {
               const user = await queueChannel.guild.members.fetch(member.queue_member_id);
               user
                  ?.send(
                     `Hey <@${user.id}>, you were just pulled from the \`${queueChannel.name}\` queue ` +
                        `in \`${queueChannel.guild.name}\`. Thanks for waiting!`
                  )
                  .catch(() => null);
            }
         }
         await QueueMemberTable.unstoreQueueMembers(
            queueChannel.id,
            nextQueueMembers.map((member) => member.queue_member_id)
         );
         SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      } else {
         SchedulingUtils.scheduleResponseToMessage(`\`${queueChannel.name}\` is empty.`, message);
      }
   }

   /**
    * Shuffles a queue
    */
   public static async shuffleQueue(parsed: ParsedArguments): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredChannel(parsed);
      if (!queueChannel) return;

      const queueMembers = await QueueMemberTable.getFromQueue(queueChannel.id);
      const queueMemberTimeStamps = queueMembers.map((member) => member.created_at);
      this.shuffleArray(queueMemberTimeStamps);
      for (let i = 0; i < queueMembers.length; i++) {
         await Base.getKnex()<QueueMember>("queue_members").where("id", queueMembers[i].id).update("created_at", queueMemberTimeStamps[i]);
      }
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      const channel = parsed.message.channel as TextChannel | NewsChannel;
      MessagingUtils.sendTempMessage(`\`${queueChannel.name}\` queue shuffled.`, channel, 10);
   }

   /**
    * Pop a member from a text channel queue
    */
   public static async clearQueue(parsed: ParsedArguments): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredChannel(parsed);
      if (!queueChannel) return;

      await QueueMemberTable.unstoreQueueMembers(queueChannel.id);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      SchedulingUtils.scheduleResponseToMessage(`\`${queueChannel.name}\` queue cleared.`, parsed.message);
   }

   /**
    * Add bot to a voice channel for swapping
    */
   public static async start(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      const queueChannel = await ParsingUtils.getStoredChannel(parsed, false, "voice");
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
               SchedulingUtils.scheduleResponseToMessage(`I can't join \`${queueChannel.name}\` because it is full`, message);
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
    */
   public static async setSizeLimit(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      const queueChannel = await ParsingUtils.getStoredChannel(parsed);
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
         SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
         await QueueChannelTable.get(queueChannel.id).update("max_members", maxMembersInQueue);
      }
   }

   /**
    *
    */
   public static async setAutoFill(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      const queueGuild = parsed.queueGuild;
      const queueChannel = (await ParsingUtils.getStoredChannel(parsed, false, "voice")) as VoiceChannel;
      if (!queueChannel) return;

      const statusString = MessagingUtils.removeMentions(parsed.arguments, queueChannel);
      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      if (statusString) {
         if (statusString === "on") {
            SchedulingUtils.scheduleResponseToMessage(`Set autofill for \`${queueChannel.name}\` to \`ON\`.`, message);
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
            await QueueChannelTable.get(queueChannel.id).update("auto_fill", 1);
         } else if (statusString === "off") {
            SchedulingUtils.scheduleResponseToMessage(
               `Set autofill for \`${queueChannel.name}\` to \`OFF\`.\n` +
                  `Queue Bot will pull \`${storedQueueChannel.pull_num}\` at a time. ` +
                  `You can set this amount \`${queueGuild.prefix}${Base.getCmdConfig().pullNumCmd} {queue name} {#}\`.`,
               message
            );
            await QueueChannelTable.get(queueChannel.id).update("auto_fill", 0);
            await QueueChannelTable.get(queueChannel.id).update("target_channel_id", Base.getKnex().raw("DEFAULT"));
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
         } else {
            const channel = message.channel as TextChannel | NewsChannel;
            MessagingUtils.sendTempMessage(
               `\`${queueGuild.prefix}${Base.getCmdConfig().autofillCmd}\` argument must be \`ON\` or \`OFF\`.`,
               channel,
               10
            );
         }
      } else {
         SchedulingUtils.scheduleResponseToMessage(
            `Autofill for \`${queueChannel.name}\` is ` +
               (storedQueueChannel.auto_fill ? "`ON`" : `\`OFF\`.\nQueue Bot will pull \`${storedQueueChannel.pull_num}\` at a time.`),
            message
         );
      }
   }

   /**
    *
    */
   public static async setPullNum(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      const queueChannel = await ParsingUtils.getStoredChannel(parsed);
      if (!queueChannel) return;

      let pullNum = ParsingUtils.getTailingNumberFromString(message, parsed.arguments);
      if (pullNum) {
         if (pullNum > 99) {
            SchedulingUtils.scheduleResponseToMessage(`\`amount\` must be between 1 and 99`, message);
         } else {
            await QueueChannelTable.get(queueChannel.id).update("pull_num", pullNum);
            SchedulingUtils.scheduleResponseToMessage(`Set pull number for \`${queueChannel.name}\` to \`${pullNum}\``, message);
         }
      } else if (pullNum != undefined) {
         const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
         SchedulingUtils.scheduleResponseToMessage(
            `Autofill for \`${queueChannel.name}\` is ${storedQueueChannel.auto_fill ? "`ON`" : "`OFF`"}.\n` +
               `Queue Bot will pull \`${storedQueueChannel.pull_num}\` at a time.`,
            message
         );
      }
   }

   /**
    *
    */
   public static async mention(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      const queueChannel = await ParsingUtils.getStoredChannel(parsed);
      if (!queueChannel) return;
      const msg = MessagingUtils.removeMentions(parsed.arguments, queueChannel);
      const storedQueueMemberIds = await QueueMemberTable.getFromQueue(queueChannel.id).pluck("queue_member_id");
      if (storedQueueMemberIds?.length > 0) {
         SchedulingUtils.scheduleResponseToMessage(
            `**${message.author.username}** mentioned **${queueChannel.name}**` +
               (msg ? `: \`${msg}\`\n` : `.\n`) +
               storedQueueMemberIds.map((id) => `<@${id}>`).join(", "),
            message
         );
      } else {
         SchedulingUtils.scheduleResponseToMessage(`\`${queueChannel.name}\` is empty.`, message);
      }
   }

   /**
    *
    */
   public static async setHeader(parsed: ParsedArguments): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredChannel(parsed);
      if (!queueChannel) return;
      const msg = MessagingUtils.removeMentions(parsed.arguments, queueChannel);
      await QueueChannelTable.get(queueChannel.id).update("header", msg);
      const channel = parsed.message.channel as TextChannel | NewsChannel;
      MessagingUtils.sendTempMessage(`Updated **${queueChannel.name}** header.`, channel, 10);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   /**
    *
    */
   public static async myQueues(parsed: ParsedArguments): Promise<void> {
      const message = parsed.message;
      const myMemberId = message.member.id;
      const myStoredMembers = await QueueMemberTable.getFromMember(myMemberId);
      if (myStoredMembers?.length < 1) {
         SchedulingUtils.scheduleResponseToMessage(`<@!${myMemberId}> is in no queues.`, message);
         return;
      }
      const embed = new MessageEmbed();
      embed.setTitle(`${message.member.displayName}'s queues`);
      embed.setColor(parsed.queueGuild.color);
      for (const myStoredMember of myStoredMembers.slice(0, 25)) {
         const allMemberIds = await QueueMemberTable.getFromQueue(myStoredMember.queue_channel_id)
            .orderBy("created_at")
            .pluck("queue_member_id");
         const channel = message.guild.channels.cache.get(myStoredMember.queue_channel_id);
         if (channel) {
            embed.addField(
               channel.name,
               `${allMemberIds.indexOf(myMemberId.toString()) + 1} <@${myMemberId}>` +
                  (myStoredMember.personal_message ? ` -- ${myStoredMember.personal_message}` : "")
            );
         } else {
            QueueChannelTable.unstoreQueueChannel(message.guild.id, myStoredMember.queue_channel_id);
         }
      }
      parsed.message.author.send({ embed: embed });
   }

   /**
    *
    */
   public static async whitelist(parsed: ParsedArguments): Promise<void> {
      this.changePerm(parsed, 0);
   }

   /**
    *
    */
   public static async blacklist(parsed: ParsedArguments): Promise<void> {
      this.changePerm(parsed, 0);
   }

   /**
    *
    */
   private static async changePerm(parsed: ParsedArguments, perm: number): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredChannel(parsed, true);
      if (!queueChannel) return;
      const memberIdsToToggle = parsed.message.mentions.members.array().map((member) => member.id);
      const storedMemberPerms = await MemberPermsTable.getFromQueue(queueChannel.id, perm);

      if (memberIdsToToggle.length === 0) {
         SchedulingUtils.scheduleResponseToMessage(
            `Current **${perm ? "White" : "Black"}list** for ${queueChannel.name}:\n` +
               storedMemberPerms.map((member) => `<@!${member.member_id}>`).join(", "),
            parsed.message
         );
         return;
      }

      const memberIdsToAdd: string[] = [];
      const memberIdsToRemove: string[] = [];
      for (const memberId of memberIdsToToggle) {
         if (storedMemberPerms.some((storedMember) => storedMember.member_id === memberId)) {
            // Already in list, set to remove
            memberIdsToRemove.push(memberId);
         } else {
            // Not in list, set to add
            memberIdsToAdd.push(memberId);
         }
      }

      let response = "";
      if (memberIdsToRemove.length > 0) {
         // Remove from queue
         await Base.getKnex()<MemberPerm>("member_perms")
            .where("queue_channel_id", queueChannel.id)
            .whereIn("member_id", memberIdsToRemove)
            .del();
         response +=
            `Removed from ${queueChannel.name}'s **${perm ? "White" : "Black"}list**:\n` +
            memberIdsToRemove.map((id) => `<@!${id}>`).join(", ");
      }
      if (memberIdsToAdd.length > 0) {
         // Add to queue
         for (const memberId of memberIdsToAdd) {
            await Base.getKnex()<MemberPerm>("member_perms").insert({
               queue_channel_id: queueChannel.id,
               member_id: memberId,
               perm: perm,
            });
         }
         response +=
            `Added to ${queueChannel.name}'s **${perm ? "White" : "Black"}list**:\n` + memberIdsToAdd.map((id) => `<@!${id}>`).join(", ");

         // Kick blacklisted
         if (perm === 0) {
            await QueueMemberTable.unstoreQueueMembers(queueChannel.id, memberIdsToAdd);
            SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
         }
      }
      SchedulingUtils.scheduleResponseToMessage(response, parsed.message);
   }

   // Map commands to database columns and display strings
   private static serverSettingVariables = {
      [Base.getCmdConfig().gracePeriodCmd]: {
         dbVariable: "grace_period",
         label: "Grace period",
         options: "grace period",
      },
      [Base.getCmdConfig().prefixCmd]: { dbVariable: "prefix", label: "Prefix", options: "prefix" },
      [Base.getCmdConfig().colorCmd]: { dbVariable: "color", label: "Color", options: "color" },
      [Base.getCmdConfig().cleanupCmd]: { dbVariable: "cleanup_commands", label: "Cleanup", options: "on|off" },
      [Base.getCmdConfig().modeCmd]: { dbVariable: "msg_mode", label: "Message mode", options: "message mode" },
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
