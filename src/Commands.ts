import { Message, MessageEmbed, MessageOptions, TextChannel, VoiceChannel } from "discord.js";
import { ParsedArguments, QueueChannel, QueueGuild, QueueMember } from "./utilities/Interfaces";
import { Base } from "./utilities/Base";
import { MessageUtils } from "./utilities/MessageUtils";
import { ParsingUtils } from "./utilities/ParsingUtils";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { MutexUtils } from "./utilities/MutexUtils";

export class Commands extends Base {
   // Map commands to database columns and display strings
   private static serverSettingVariables = {
      [Base.config.gracePeriodCmd]: {
         dbVariable: "grace_period",
         str: "grace period",
      },
      [Base.config.prefixCmd]: { dbVariable: "prefix", str: "prefix" },
      [Base.config.colorCmd]: { dbVariable: "color", str: "color" },
      [Base.config.modeCmd]: { dbVariable: "msg_mode", str: "message mode" },
   };

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
      queueChannel?: VoiceChannel | TextChannel
   ): Promise<void> {
      queueChannel = queueChannel || (await ParsingUtils.fetchChannel(queueGuild, parsed, message));
      if (!queueChannel) {
         return;
      }

      const displayChannel = message.channel as TextChannel;

      if (
         displayChannel.permissionsFor(message.guild.me).has("SEND_MESSAGES") &&
         displayChannel.permissionsFor(message.guild.me).has("EMBED_LINKS")
      ) {
         const embedList = await MessageUtils.generateEmbed(queueGuild, queueChannel);
         // Remove old display
         await DisplayChannelTable.unstoreDisplayChannel(queueChannel.id, displayChannel.id);
         // Create new display
         await DisplayChannelTable.storeDisplayChannel(queueChannel, displayChannel, embedList);
      } else {
         message.author.send(`I don't have permission to write messages and embeds in \`${displayChannel.name}\`.`).catch(() => null);
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

      const embeds: MessageOptions[] = [
         {
            embed: {
               author: {
                  iconURL: "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/icon.png",
                  name: "Queue Bot",
                  url: "https://top.gg/bot/679018301543677959",
               },
               color: storedColor,
               fields: [
                  {
                     name: "Access",
                     value: "Available to everyone.",
                  },
                  {
                     name: "Join a Text Channel Queue",
                     value: `\`${storedPrefix}${this.config.joinCmd} {channel name} {OPTIONAL: message to display next to your name}\` joins or leaves a text channel queue.`,
                  },
               ],
               title: "Non-Restricted Commands",
            },
         },
         {
            embed: {
               color: storedColor,
               fields: [
                  {
                     name: "Access",
                     value: "Available to owners or users with `queue mod`, `mod` or `admin` in their server roles.",
                  },
                  {
                     name: "Modify & View Queues",
                     value:
                        `\`${storedPrefix}${this.config.queueCmd} {channel name} {OPTIONAL: size}\` creates a new queue or deletes an existing queue.` +
                        `\n\`${storedPrefix}${this.config.queueCmd}\` shows the existing queues.`,
                  },
                  {
                     name: "Display Queue Members",
                     value: `\`${storedPrefix}${this.config.displayCmd} {channel name}\` displays the members in a queue. These messages stay updated.`,
                  },
                  {
                     name: "Pull Users from Voice Queue",
                     value:
                        `\`${storedPrefix}${this.config.startCmd} {channel name}\` adds the bot to a queue voice channel.` +
                        ` The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue.` +
                        ` Right-click the bot to disconnect it from the voice channel when done. See the example gif below.`,
                  },
                  {
                     name: "Pull Users from Text Queue",
                     value: `\`${storedPrefix}${this.config.nextCmd} {channel name} {OPTIONAL: amount}\` removes people from the text queue and displays their name.`,
                  },
                  {
                     name: "Add Others to a Text Channel Queue",
                     value: `\`${storedPrefix}${this.config.joinCmd} {channel name} @{user 1} @{user 2} ...\` adds other people from text channel queue.`,
                  },
                  {
                     name: "Kick Users from Queue",
                     value: `\`${storedPrefix}${this.config.kickCmd} {channel name} @{user 1} @{user 2} ...\` kicks one or more people from a queue.`,
                  },
                  {
                     name: "Clear Queue",
                     value: `\`${storedPrefix}${this.config.clearCmd} {channel name}\` clears a queue.`,
                  },
                  {
                     name: "Shuffle Queue",
                     value: `\`${storedPrefix}${this.config.shuffleCmd} {channel name}\` shuffles a queue.`,
                  },
                  {
                     name: "Change Queue Size Limit",
                     value: `\`${storedPrefix}${this.config.limitCmd} {channel name} {size limit} \` changes queue size limit.`,
                  },
                  {
                     name: "Change the Grace Period",
                     value: `\`${storedPrefix}${this.config.gracePeriodCmd} {time in seconds}\` changes how long a person can leave a queue before being removed.`,
                  },
                  {
                     name: "Change the Command Prefix",
                     value: `\`${storedPrefix}${this.config.prefixCmd} {new prefix}\` changes the prefix for commands.`,
                  },
                  {
                     name: "Change the Color",
                     value: `\`${storedPrefix}${this.config.colorCmd} {new color}\` changes the color of bot messages.`,
                  },
                  {
                     name: "Change the Display Mode",
                     value:
                        `\`${storedPrefix}${this.config.modeCmd} {new mode}\` changes how the display messages are updated.` +
                        `\n\`${storedPrefix}${this.config.modeCmd}\` displays the different update modes.`,
                  },
               ],
               image: {
                  url: "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/example.gif",
               },
               title: "Restricted Commands",
            },
         },
      ];

      const channels = message.guild.channels.cache.filter((channel) => channel.type === "text").array() as TextChannel[];
      const displayChannel = ParsingUtils.extractChannel(channels, parsed, message) as TextChannel;

      if (parsed.arguments && displayChannel) {
         if (
            displayChannel.permissionsFor(message.guild.me).has("SEND_MESSAGES") &&
            displayChannel.permissionsFor(message.guild.me).has("EMBED_LINKS")
         ) {
            // Channel found and bot has permission, print.
            embeds.forEach((em) => displayChannel.send(em).catch(() => null));
         } else {
            // Channel found, but no permission. Send permission and help messages to user.
            message.author
               .send(`I don't have permission to write messages and embeds in ` + `\`${displayChannel.name}\``)
               .catch(() => null);
         }
      } else {
         // No channel provided. Send help to user.
         embeds.map((em) => {
            message.author.send(em).catch(() => null);
         });

         MessageUtils.scheduleResponse(message, "I have sent help to your PMs.");
      }
   }

   /**
    * Kick a member from a queue
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async kickMember(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      // remove user mentions
      parsed.arguments = parsed.arguments.replace(/<@!?\d+>/gi, "").trim();
      // Get queue channel
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message, message.mentions.members.size > 0, "text");
      if (!queueChannel) {
         return;
      }
      // Parse message and members
      const memberIdsToKick = message.mentions.members.array().map((member) => member.id);
      if (!memberIdsToKick || memberIdsToKick.length === 0) {
         return;
      }

      let updateDisplays = false;
      const storedQueueMemberIds = await this.knex<QueueMember>("queue_members")
         .where("queue_channel_id", queueChannel.id)
         .whereIn("queue_member_id", memberIdsToKick)
         .pluck("queue_member_id");

      if (storedQueueMemberIds && storedQueueMemberIds.length > 0) {
         updateDisplays = true;
         // Remove from queue
         await this.knex<QueueMember>("queue_members")
            .whereIn("queue_member_id", memberIdsToKick)
            .where("queue_channel_id", queueChannel.id)
            .del();
         MessageUtils.scheduleResponse(
            message,
            "Kicked " + storedQueueMemberIds.map((id) => `<@!${id}>`).join(", ") + ` from the \`${queueChannel.name}\` queue.`
         );
      }
      if (updateDisplays) {
         await MessageUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      }
   }

   /**
    * Change a server setting
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
      embed?: Partial<MessageEmbed>
   ): Promise<void> {
      // Setup common variables
      const setting = this.serverSettingVariables[parsed.command];
      const guild = message.guild;
      const channels = await QueueChannelTable.fetchStoredQueueChannels(guild);

      if (parsed.arguments && passesValueRestrictions) {
         // Store channel to database
         await this.knex<QueueGuild>("queue_guilds")
            .where("guild_id", message.guild.id)
            .first()
            .update(setting.dbVariable, parsed.arguments);
         queueGuild[setting.dbVariable] = parsed.arguments;
         MessageUtils.scheduleResponse(message, `Set \`${setting.str}\` to \`${parsed.arguments}\`.`);
         for (const channel of channels) {
            await MessageUtils.scheduleDisplayUpdate(queueGuild, channel, true);
         }
      } else {
         MessageUtils.scheduleResponse(message, {
            content:
               `The ${setting.str} is currently set to \`${queueGuild[setting.dbVariable]}\`.\n` +
               `Set a new ${setting.str} using \`${queueGuild.prefix}${parsed.command} {${setting.str}}\`.\n` +
               extraErrorLine,
            embed,
         });
      }
   }

   /**
    * Toggle a channel's queue status. Display existing queues if no argument is provided.
    * @param queueGuild
    * @param parsed Parsed message - prefix, command, argument.
    * @param message Discord message object.
    */
   public static async setQueueChannel(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      // Setup common variables
      const parsedArgs = parsed.arguments;
      const guild = message.guild;

      // Get stored queue channel list from database
      const storedChannels = await QueueChannelTable.fetchStoredQueueChannels(guild);
      // Channel argument provided. Toggle it
      if (parsedArgs) {
         const channels = message.guild.channels.cache.filter((channel) => channel.type !== "category").array() as Array<
            VoiceChannel | TextChannel
         >;
         const queueChannel = ParsingUtils.extractChannel(channels, parsed, message);
         if (!queueChannel) {
            ParsingUtils.reportChannelNotFound(queueGuild, parsed, channels, message, false, null);
            return;
         }

         if (storedChannels.some((storedChannel) => storedChannel.id === queueChannel.id)) {
            // Channel is already stored, remove it
            await QueueChannelTable.unstoreQueueChannel(guild.id, queueChannel.id);
            if (queueChannel.type === "voice") {
               if (queueChannel.userLimit > 0) {
                  (queueChannel as VoiceChannel).setUserLimit(0).catch(() => null);
               }
            }
            MessageUtils.scheduleResponse(message, `Deleted queue for \`${queueChannel.name}\`.`);
         } else {
            // Get number of users to pop
            let maxMembersInQueue = ParsingUtils.getTailingNumberFromString(message, parsedArgs);
            if (maxMembersInQueue) {
               if (maxMembersInQueue < 1) return; // invalid amount
               if (queueChannel.type === "voice") {
                  if (maxMembersInQueue > 99) {
                     MessageUtils.scheduleResponse(message, `Max \`amount\` is 99. Using 99.`);
                     maxMembersInQueue = 99;
                  }
                  if (queueChannel.permissionsFor(message.guild.me).has("MANAGE_CHANNELS")) {
                     (queueChannel as VoiceChannel).setUserLimit(maxMembersInQueue).catch(() => null);
                  } else {
                     MessageUtils.scheduleResponse(
                        message,
                        "I can automatically set voice channel user limits if you grant me permission. " +
                           "Found in `Server Settings` > `Roles` > `Queue Bot` > enable `Manage Channels`"
                     );
                  }
               }
            }
            // It's not in the list, add it
            await QueueChannelTable.storeQueueChannel(queueChannel, maxMembersInQueue);
            await this.displayQueue(queueGuild, parsed, message, queueChannel);
         }
      } else {
         // No argument. Display current queues
         if (storedChannels.length > 0) {
            MessageUtils.scheduleResponse(message, `Current queues: ${storedChannels.map((ch) => ` \`${ch.name}\``)}`);
         } else {
            MessageUtils.scheduleResponse(
               message,
               `No queue channels set.` + `\nSet a new queue channel using \`${queueGuild.prefix}${this.config.queueCmd} {channel name}\``
               // 	+ `\nChannels: ${channels.map(channel => ` \`${channel.name}\``)}`
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
      // Get queue channel
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message, message.mentions.members.size > 0, "text");
      if (!queueChannel) {
         return;
      }

      const storedQueueChannel = await this.knex<QueueChannel>("queue_channels").where("queue_channel_id", queueChannel.id).first();

      let response = "";
      await MutexUtils.getMemberLock(storedQueueChannel.queue_channel_id).runExclusive(async () => {
         const storedQueueMembers = await this.knex<QueueMember>("queue_members").where("queue_channel_id", queueChannel.id);

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
                  MessageUtils.scheduleResponse(
                     message,
                     `Failed to join. ${
                        queueChannel.name
                     } queue is full (${+storedQueueChannel.max_members}/${+storedQueueChannel.max_members}).`
                  );
               } else {
                  memberIdsToAdd.push(memberId);
               }
            }
         }

         if (memberIdsToRemove.length > 0) {
            // Remove from queue
            await QueueMemberTable.unstoreQueueMembers(queueChannel.id, memberIdsToRemove);
            response += "Removed " + memberIdsToRemove.map((id) => `<@!${id}>`).join(", ") + ` from the \`${queueChannel.name}\` queue.\n`;
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
            response += "Added " + memberIdsToAdd.map((id) => `<@!${id}>`).join(", ") + ` to the \`${queueChannel.name}\` queue.`;
         }
      });

      MessageUtils.scheduleResponse(message, response);
      MessageUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
   }

   /**
    * Pop a member from a text channel queue
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async popTextQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      // Get number of users to pop
      const numToPop = ParsingUtils.getTailingNumberFromString(message, parsed.arguments) || 1;
      if (numToPop < 1) {
         return;
      }

      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message, false);
      if (!queueChannel) {
         return;
      }

      // Get the oldest member entry for the queue
      let nextQueueMembers = await this.knex<QueueMember>("queue_members").where("queue_channel_id", queueChannel.id).orderBy("created_at");
      nextQueueMembers = nextQueueMembers.slice(0, numToPop);

      if (nextQueueMembers.length > 0) {
         // if (queueChannel.type === 'voice') {
         //    //nextQueueMembers.map(queueMember => {
         //    //    const member = queueChannel.members.find(member => member.id === queueMember.queue_member_id);
         //    //    member.voice.setChannel(CHANNEL).catch(() => null);
         //    //})
         // }

         // Display and remove member from the the queue
         MessageUtils.scheduleResponse(
            message,
            `Pulled ` + nextQueueMembers.map((member) => `<@!${member.queue_member_id}>`).join(", ") + ` from \`${queueChannel.name}\`.`
         );
         await QueueMemberTable.unstoreQueueMembers(
            queueChannel.id,
            nextQueueMembers.map((member) => member.queue_member_id)
         );
         await MessageUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      } else {
         MessageUtils.scheduleResponse(message, `\`${queueChannel.name}\` is empty.`);
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
      if (!queueChannel) {
         return;
      }

      const queueMembers = await this.knex<QueueMember>("queue_members").where("queue_channel_id", queueChannel.id);
      const queueMemberTimeStamps = queueMembers.map((member) => member.created_at);
      this.shuffleArray(queueMemberTimeStamps);
      for (let i = 0; i < queueMembers.length; i++) {
         await this.knex<QueueMember>("queue_members").where("id", queueMembers[i].id).update("created_at", queueMemberTimeStamps[i]);
      }
      await MessageUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      MessageUtils.scheduleResponse(message, `\`${queueChannel.name}\` queue shuffled.`);
   }

   /**
    * Pop a member from a text channel queue
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async clearQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const queueChannel = await ParsingUtils.fetchChannel(queueGuild, parsed, message);
      if (!queueChannel) {
         return;
      }

      await QueueMemberTable.unstoreQueueMembers(queueChannel.id);
      await MessageUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      MessageUtils.scheduleResponse(message, `\`${queueChannel.name}\` queue cleared.`);
   }

   /**
    * Add bot to a voice channel for swapping
    * @param queueGuild
    * @param parsed
    * @param message Discord message object.
    */
   public static async start(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      const channel = await ParsingUtils.fetchChannel(queueGuild, parsed, message, false, "voice");
      if (!channel) {
         return;
      }

      if (channel.permissionsFor(message.guild.me).has("CONNECT")) {
         if (channel.type === "voice") {
            try {
               channel.join().then((connection) => {
                  if (connection) {
                     connection.on("warn", (e) => console.warn(e));
                     connection.on("error", (e) => console.error(e));
                     connection.on("failed", (e) => console.error(e));
                     connection.voice?.setSelfDeaf(true);
                     connection.voice?.setSelfMute(true);
                  }
               });
            } catch (e) {
               // ignore
            }
         } else {
            MessageUtils.scheduleResponse(message, "I can only join voice channels.");
         }
      } else {
         MessageUtils.scheduleResponse(message, "I need the permissions to join your voice channel!");
      }
   }

   /**
    * Change voice channel limits command
    * @param queueGuild
    * @param parsed Parsed message - prefix, command, argument.
    * @param message Discord message object.
    */
   public static async setSizeLimit(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
      // Setup common variables
      const parsedArgs = parsed.arguments;
      const guild = message.guild;
      // Channel argument provided. Toggle it
      if (parsedArgs) {
         // Get stored queue channel list from database
         const channels = guild.channels.cache.filter((channel) => channel.type !== "category").array() as (VoiceChannel | TextChannel)[];
         const queueChannel = ParsingUtils.extractChannel(channels, parsed, message);
         let maxMembersInQueue = ParsingUtils.getTailingNumberFromString(message, parsedArgs);
         if (queueChannel && maxMembersInQueue) {
            if (maxMembersInQueue < 1) return; // invalid amount
            if (queueChannel.type === "voice") {
               if (maxMembersInQueue > 99) {
                  MessageUtils.scheduleResponse(message, `Max \`amount\` is 99. Using 99.`);
                  maxMembersInQueue = 99;
               }
               if (queueChannel.permissionsFor(guild.me).has("MANAGE_CHANNELS")) {
                  (queueChannel as VoiceChannel).setUserLimit(maxMembersInQueue).catch(() => null);
               } else {
                  MessageUtils.scheduleResponse(
                     message,
                     "I can automatically set voice channel user limits if you grant me permission. " +
                        "Found in `Server Settings` > `Roles` > `Queue Bot` > enable `Manage Channels`"
                  );
               }
            }
            MessageUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
            await this.knex<QueueChannel>("queue_channels")
               .where("queue_channel_id", queueChannel.id)
               .update("max_members", maxMembersInQueue);
         }
      }
   }

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
