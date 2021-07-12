import { TextChannel, VoiceChannel, GuildMember, MessageEmbed, MessageEmbedOptions, Snowflake } from "discord.js";
import { QueueGuild } from "./utilities/Interfaces";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { Parsed, ParsingUtils } from "./utilities/ParsingUtils";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { SchedulingUtils } from "./utilities/SchedulingUtils";
import { Voice } from "./utilities/VoiceUtils";
import { AdminPermissionTable } from "./utilities/tables/AdminPermissionTable";
import { BlackWhiteListTable } from "./utilities/tables/BlackWhiteListTable";
import { PriorityTable } from "./utilities/tables/PriorityTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";

export class Commands {
   // --------------------------------- AUTOPULL ------------------------------- //

   /**
    * Get the current autopull settings
    */
   public static async autopullGet(parsed: Parsed) {
      const storedQueueChannels = await QueueChannelTable.getFromGuild(parsed.command.guild.id);
      let response = "**Autopull**:\n";
      for await (const storedQueueChannel of storedQueueChannels) {
         const queueChannel = (await parsed.command.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.auto_fill ? "on" : "off"}\n`;
      }
      await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
   }

   /**
    * Toggle automatic pull of users from a queue
    */
   public static async autopullSet(parsed: Parsed) {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;

      const value = parsed.getStringParam() === "off" ? 0 : 1;
      await QueueChannelTable.updateAutopull(queueChannel.id, value);
      await parsed.command.reply(`Set autopull of \`${queueChannel.name}\` to \`${value ? "on" : "off"}\`.`).catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- BLACKLIST / WHITELIST ------------------------------- //\

   /**
    * HELPER
    */
   private static async genBlacklistWhitelistList(queueChannel: VoiceChannel | TextChannel, type: number): Promise<string> {
      const typeString = type ? "White" : "Black";
      const storedEntries = await BlackWhiteListTable.getMany(type, queueChannel.id);
      let response = `\n\n${typeString}list of \`${queueChannel.name}\`: `;
      if (storedEntries?.length) {
         response += storedEntries.map((entry) => "<@" + (entry.is_role ? "&" : "") + entry.role_member_id + ">").join(", ");
      } else {
         response += "Empty";
      }
      return response;
   }

   /**
    * HELPER
    */
   private static async blacklistWhitelistAdd(parsed: Parsed, type: number): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;
      const member = parsed.getMemberParam();
      const role = parsed.getRoleParam();
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      const typeString = type ? "white" : "black";
      let response = "";

      if (await BlackWhiteListTable.get(type, queueChannel.id, id)) {
         response += `\`${name}\` is already on the ${typeString}list of \`${queueChannel.name}\`.`;
      } else {
         await BlackWhiteListTable.store(type, queueChannel.id, id, role != null);
         if (typeString === "black") {
            await this.kickFromQueue(parsed.queueGuild, queueChannel, member);
         }
         response += `Added \`${name}\` to the ${typeString}list of \`${queueChannel.name}\`.`;
      }

      response += await this.genBlacklistWhitelistList(queueChannel, type);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null);
   }

   /**
    * Add a user or role to a queue's blacklist
    */
   public static async blacklistAdd(parsed: Parsed): Promise<void> {
      this.blacklistWhitelistAdd(parsed, 0);
   }

   /**
    * HELPER
    */
   private static async blacklistWhitelistDelete(parsed: Parsed, type: number): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;
      const member = parsed.getMemberParam();
      const role = parsed.getRoleParam();
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      const typeString = type ? "white" : "black";
      let response = "";

      if (await BlackWhiteListTable.get(type, queueChannel.id, id)) {
         await BlackWhiteListTable.unstore(type, queueChannel.id, id);
         response += `Removed \`${name}\` from the ${typeString}list of \`${queueChannel.name}\`.`;
      } else {
         response += `\`${name}\` was not on the ${typeString}list of \`${queueChannel.name}\`.`;
      }

      response += await this.genBlacklistWhitelistList(queueChannel, type);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null);
   }

   /**
    * Remove a user or role from a queue's blacklist
    */
   public static async blacklistDelete(parsed: Parsed): Promise<void> {
      this.blacklistWhitelistDelete(parsed, 0);
   }

   /**
    * HELPER
    */
   private static async blacklistWhitelistList(parsed: Parsed, type: number): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;
      const response = await this.genBlacklistWhitelistList(queueChannel, type);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null);
   }

   /**
    * Display a queue's blacklist
    */
   public static async blacklistList(parsed: Parsed) {
      this.blacklistWhitelistList(parsed, 0);
   }

   // --------------------------------- CLEAR ------------------------------- //

   /**
    * Clear a queue
    */
   public static async clear(parsed: Parsed): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;

      await QueueMemberTable.unstore(queueChannel.id);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      await parsed.command.reply(`\`${queueChannel.name}\` queue cleared.`).catch(() => null);
   }

   // --------------------------------- COLOR ------------------------------- //

   /**
    * Get the current color settings
    */
   public static async colorGet(parsed: Parsed) {
      const storedQueueChannels = await QueueChannelTable.getFromGuild(parsed.command.guild.id);
      let response = "**Colors**:\n";
      for await (const storedQueueChannel of storedQueueChannels) {
         const queueChannel = (await parsed.command.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.color}\n`;
      }
      await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
   }

   /**
    * Set a new color for a queue
    */
   public static async colorSet(parsed: Parsed) {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;

      const value = parsed.getStringParam();
      if (/^#?[0-9A-F]{6}$/i.test(value)) {
         await QueueChannelTable.updateColor(queueChannel.id, value);
         await parsed.command.reply(`Set color of \`${queueChannel.name}\` to \`${value}\`.`).catch(() => null);
         SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      } else {
         await parsed.command.reply({
            content: `${value} is not a HEX color value. Please use a HEX color value like \`#51ff7e\`.`,
            embeds: [{ title: "HEX Color Picker", url: "https://htmlcolorcodes.com/color-picker/" }],
            ephemeral: true,
         }).catch(() => null).catch(() => null);
      }
   }

   // --------------------------------- DISPLAY ------------------------------- //

   /**
    * Display the users in a queue. These messages stay updated
    */
   public static async display(parsed: Parsed, channel?: VoiceChannel | TextChannel): Promise<void> {
      const queueChannel = channel || (await ParsingUtils.getStoredQueue(parsed));
      if (!queueChannel) return;
      const author = parsed.command.member as GuildMember;
      if (!author?.id) return;

      const displayChannel = parsed.command.channel as TextChannel;
      const displayPermission = displayChannel.permissionsFor(displayChannel.guild.me);
      if (displayPermission.has("SEND_MESSAGES") && displayPermission.has("EMBED_LINKS")) {
         const embeds = await MessagingUtils.generateEmbed(queueChannel);

         // Remove old display
         await DisplayChannelTable.unstore(queueChannel.id, displayChannel.id);
         // Create new display
         await DisplayChannelTable.store(queueChannel, displayChannel, embeds);
         if (!channel) {
            await parsed.command.reply({ content: "Displayed.", ephemeral: true }).catch(() => null);
         }
      } else {
         author.send(`I don't have permission to write messages and embeds in \`${displayChannel.name}\`.`).catch(() => null);
      }
   }

   // --------------------------------- ENQUEUE ------------------------------- //

   /**
    * Add a specified user to a queue
    */
   public static async enqueue(parsed: Parsed): Promise<void> {
      const queueChannel = (await ParsingUtils.getStoredQueue(parsed, "GUILD_TEXT")) as TextChannel;
      if (!queueChannel) return;
      const member = parsed.getMemberParam();
      if (!member?.id) return;

      const storedQueueMembers = await QueueMemberTable.getFromQueue(queueChannel);

      if (storedQueueMembers.some((storedMember) => storedMember.member_id === member.id)) {
         await parsed.command.reply(`They were already in \`${queueChannel.name}\`.`).catch(() => null);
      } else {
         const customMessage = parsed.getStringParam()?.substring(0, 128);
         await QueueMemberTable.store(queueChannel, member, customMessage, true);
         await parsed.command.reply(`Added \`${member.displayName}\` to \`${queueChannel.name}\`.`).catch(() => null);
      }

      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- GRACEPERIOD ------------------------------- //

   /**
    * Get the current grace period settings
    */
   public static async graceperiodGet(parsed: Parsed) {
      const storedQueueChannels = await QueueChannelTable.getFromGuild(parsed.command.guild.id);
      let response = "**Grace Periods**:\n";
      for await (const storedQueueChannel of storedQueueChannels) {
         const queueChannel = (await parsed.command.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.grace_period || 0}\n`;
      }
      await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
   }

   /**
    * Set how long a user can leave a voice queue before losing their spot
    */
   public static async graceperiodSet(parsed: Parsed) {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;

      const value = parsed.getNumberParam(0, 6000);
      await QueueChannelTable.updateGraceperiod(queueChannel.id, value);
      await parsed.command.reply(`Set grace period of \`${queueChannel.name}\` to \`${value}\`.`).catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- HEADER ------------------------------- //

   /**
    * Set or remove a header for a queue's display messages
    */
   public static async headerGet(parsed: Parsed): Promise<void> {
      const storedQueueChannels = await QueueChannelTable.getFromGuild(parsed.command.guild.id);
      let response = "**Headers**:\n";
      for await (const storedQueueChannel of storedQueueChannels) {
         const queueChannel = (await parsed.command.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.header || "none"}\n`;
      }
      await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
   }

   /**
    * Set or remove a header for a queue's display messages
    */
   public static async headerSet(parsed: Parsed): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;
      const message = parsed.getStringParam() || "";

      console.log(message);

      await QueueChannelTable.updateHeader(queueChannel.id, message);
      await parsed.command.reply(`Updated **${queueChannel.name}** header.`).catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- HELP ------------------------------- //

   /**
    * Display general help messages
    */
   public static async help(parsed: Parsed): Promise<void> {
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
               name: "`/join`",
               value: "Join a text queue",
            },
            {
               name: "`/leave`",
               value: "Leave a text queue",
            },
            {
               name: "`/myqueues`",
               value: "Show my queues",
            },
            {
               name: "`/help setup`",
               value: "Setup & admin commands",
            },
         ],
      };
      await parsed.command.reply({ embeds: [response], ephemeral: true }).catch(() => null);
   }

   /**
    * Display help messages for queues
    */
   public static async helpQueue(parsed: Parsed): Promise<void> {
      const response: MessageEmbedOptions = {
         author: { name: "privileged Commands" },
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
               name: "`/clear`",
               value: "Clear a queue",
            },
            {
               name: "`/color`",
               value: "Get / Set color of queue displays",
            },
            {
               name: "`/display`",
               value: "Display a queue",
            },
            {
               name: "`/enqueue`",
               value: "Add another user to a queue",
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
               name: "`/kick`",
               value: "Kick a user from a queue",
            },
            {
               name: "`/kick all`",
               value: "Kick a user from all queue",
            },
            {
               name: "`/mention`",
               value: "Mention everyone in a Queue",
            },
            {
               name: "`/next`",
               value: "Pull from a text queue",
            },
            {
               name: "`/pullnum`",
               value: "Get / Set # of users to pull when manually pulling from a voice queue",
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
               name: "`/shuffle`",
               value: "Shuffle a queue",
            },
            {
               name: "`/size`",
               value: "Get / Set the size limits of queues",
            },
            {
               name: "`/start`",
               value: "Add the bot to a voice queue",
            },
         ],
      };
      const content = parsed.hasPermission ? "✅ You can use privileged commands." : "❌ You can *NOT* use privileged commands.";
      await parsed.command.reply({ content: content, embeds: [response], ephemeral: true }).catch(() => null);
   }

   /**
    * Display help messages for bot settings
    */
   public static async helpBot(parsed: Parsed): Promise<void> {
      const response: MessageEmbedOptions = {
         author: { name: "privileged Commands" },
         title: "Bot Management",
         fields: [
            {
               name: "`/mode`",
               value: "Set display mode",
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
         ],
      };
      const content = parsed.hasPermission ? "✅ You can use privileged commands." : "❌ You can *NOT* use privileged commands.";
      await parsed.command.reply({ content: content, embeds: [response], ephemeral: true }).catch(() => null);
   }

   /**
    *
    */
   public static async helpSetup(parsed: Parsed): Promise<void> {
      const response: MessageEmbedOptions = {
         author: { name: "privileged Commands" },
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
      const content = parsed.hasPermission ? "✅ You can use privileged commands." : "❌ You can *NOT* use privileged commands.";
      await parsed.command.reply({ content: content, embeds: [response], ephemeral: true }).catch(() => null);
   }

   // --------------------------------- JOIN ------------------------------- //

   /**
    * Join a text queue
    */
   public static async join(parsed: Parsed): Promise<void> {
      const queueChannel = (await ParsingUtils.getStoredQueue(parsed, "GUILD_TEXT")) as TextChannel;
      if (!queueChannel) return;
      const author = parsed.command.member as GuildMember;
      if (!author?.id) return;

      const storedQueueMembers = await QueueMemberTable.getFromQueue(queueChannel);
      const storedChannel = await QueueChannelTable.get(queueChannel.id);
      if (storedChannel.max_members && storedChannel.max_members <= storedQueueMembers?.length) {
         // Full
         await parsed.command.reply({ content: `**ERROR**: \`${queueChannel.name}\` is full.`, ephemeral: true }).catch(() => null);
      } else if (storedQueueMembers.some((storedMember) => storedMember.member_id === author.id)) {
         // Already member
         await parsed.command.reply({ content: `You are already in \`${queueChannel.name}\`.`, ephemeral: true }).catch(() => null);
      } else {
         const customMessage = parsed.getStringParam()?.substring(0, 128);
         if (await QueueMemberTable.store(queueChannel, author, customMessage)) {
            // Join
            await parsed.command.reply({ content: `You joined \`${queueChannel.name}\`.`, ephemeral: true }).catch(() => null);
         } else {
            // Blacklisted
            await parsed.command.reply({ content: `**ERROR**: You are blacklisted from \`${queueChannel.name}\``, ephemeral: true }).catch(() => null);
         }
      }

      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- KICK ------------------------------- //

   /**
    * HELPER
    */
   private static async kickFromQueue(queueGuild: QueueGuild, channel: TextChannel | VoiceChannel, member: GuildMember): Promise<void> {
      if (channel.type === "GUILD_VOICE") {
         member?.voice?.kick().catch(() => null);
      } else {
         await QueueMemberTable.get(channel.id, member.id).delete();
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, channel as TextChannel | VoiceChannel);
      }
   }

   /**
    * Kick a user from a specified queue
    */
   public static async kick(parsed: Parsed): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;
      const member = parsed.getMemberParam();
      if (!member?.id) return;

      this.kickFromQueue(parsed.queueGuild, queueChannel, member);
      await parsed.command.reply(`Kicked <@!${member.id}> from \`${queueChannel.name}\` queue.`).catch(() => null);
   }

   // --------------------------------- KICKALL ------------------------------- //

   /**
    * Kick a user from all queues
    */
   public static async kickAll(parsed: Parsed): Promise<void> {
      const member = parsed.getMemberParam();
      if (!member?.id) return;
      const channels: (VoiceChannel | TextChannel)[] = [];
      const entries = await QueueMemberTable.getFromMember(member.id);
      for await (const entry of entries) {
         const queueChannel = (await parsed.command.guild.channels.fetch(entry.id).catch(() => null)) as VoiceChannel | TextChannel;
         if (!queueChannel) continue;
         channels.push(queueChannel);
      }
      channels.forEach((ch) => this.kickFromQueue(parsed.queueGuild, ch, member));
      await parsed.command.reply(`Kicked <@!${member.id}> from ` + channels.map((ch) => `\`${ch.name}\``).join(", ") + " queues.").catch(() => null);
   }

   // --------------------------------- LEAVE ------------------------------- //

   /**
    * Leave a text queue
    */
   public static async leave(parsed: Parsed): Promise<void> {
      const queueChannel = (await ParsingUtils.getStoredQueue(parsed, "GUILD_TEXT")) as TextChannel;
      if (!queueChannel) return;
      const author = parsed.command.member as GuildMember;
      if (!author?.id) return;

      const storedQueueMembers = await QueueMemberTable.getFromQueue(queueChannel);
      if (storedQueueMembers.some((storedMember) => storedMember.member_id === author.id)) {
         await QueueMemberTable.unstore(queueChannel.id, [author.id]);
         await parsed.command.reply({ content: `You left \`${queueChannel.name}\`.`, ephemeral: true }).catch(() => null);
      } else {
         await parsed.command.reply({ content: `You were not in \`${queueChannel.name}\`.`, ephemeral: true }).catch(() => null);
      }

      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- MENTION ------------------------------- //

   /**
    * Mention everyone in a queue. You can add a message too
    */
   public static async mention(parsed: Parsed): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;
      const author = parsed.command.member as GuildMember;
      if (!author?.id) return;
      const message = parsed.getStringParam();

      const storedMembers = await QueueMemberTable.getFromQueue(queueChannel);
      if (storedMembers.length > 0) {
         await parsed.command.reply(
            `**${author.displayName}** mentioned **${queueChannel.name}**` +
               (message ? `: \`${message}\`\n` : `.\n`) +
               storedMembers.map((member) => `<@!${member.member_id}>`).join(", ")
         ).catch(() => null);
      } else {
         await parsed.command.reply(`\`${queueChannel.name}\` is empty.`).catch(() => null);
      }
   }

   // --------------------------------- MODE ------------------------------- //

   /**
    * Get the current autopull settings
    */
   public static async modeGet(parsed: Parsed) {
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
      await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
   }

   /**
    * Toggle automatic pull of users from a queue
    */
   public static async modeSet(parsed: Parsed) {
      const value = await parsed.getNumberParam(1, 3);

      await QueueGuildTable.updateMessageMode(parsed.command.guild.id, value);
      await parsed.command.reply(`Set messaging mode to \`${value}\`.`).catch(() => null)
   }

   // --------------------------------- MYQUEUES ------------------------------- //

   /**
    * Display the queues you are in with your position
    */
   public static async myqueues(parsed: Parsed): Promise<void> {
      const author = parsed.command.member as GuildMember;
      if (!author?.id) return;

      const storedEntries = (await QueueMemberTable.getFromMember(author.id)).slice(0, 25);
      if (storedEntries?.length < 1) {
         await parsed.command.reply({ content: `You are in no queues.`, ephemeral: true }).catch(() => null)
      } else {
         const embed = new MessageEmbed();
         embed.setTitle(`${author.displayName}'s queues`);
         for await (const entry of storedEntries) {
            const queueChannel = (await author.guild.channels.fetch(entry.channel_id).catch(() => null)) as VoiceChannel | TextChannel;
            if (!queueChannel) continue;
            const memberIds = (await QueueMemberTable.getNext(queueChannel)).map((member) => member.member_id);
            embed.addField(
               queueChannel.name,
               `${memberIds.indexOf(author.id) + 1} <@!${author.id}>` + (entry.personal_message ? ` -- ${entry.personal_message}` : "")
            );
         }
         await parsed.command.reply({ embeds: [embed], ephemeral: true }).catch(() => null);
      }
   }

   // --------------------------------- NEXT ------------------------------- //

   /**
    * Pull a specified # of user(s) from a queue and display their name(s)
    */
   public static async next(parsed: Parsed): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;
      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      if (!storedQueueChannel) return;

      // Get the oldest member entries for the queue
      const amount = parsed.getNumberParam(1, 99);
      let queueMembers = await QueueMemberTable.getNext(queueChannel, amount);

      if (queueMembers.length > 0) {
         // Display and remove member from the the queue
         if (queueChannel.type === "GUILD_VOICE") {
            const targetChannel = (await queueChannel.guild.channels
               .fetch(storedQueueChannel.target_channel_id)
               .catch(() => null)) as VoiceChannel;
            if (targetChannel) {
               for (const member of queueMembers) {
                  SchedulingUtils.scheduleMoveMember(member.member.voice, targetChannel);
               }
            } else {
               await parsed.command.reply(
                  "**ERROR**: No target channel. Set a target channel by sending `/start` then dragging the bot to the target channel."
               ).catch(() => null);
               return;
            }
         } else {
            for await (const nextMember of queueMembers) {
               await nextMember.member
                  .send(
                     `Hey <@!${nextMember.member.id}>, you were just pulled from the \`${queueChannel.name}\` queue ` +
                        `in \`${queueChannel.guild.name}\`. Thanks for waiting!`
                  )
                  .catch(() => null);
            }
         }
         await parsed.command.reply(
            `Pulled ` + queueMembers.map((member) => `<@!${member.member_id}>`).join(", ") + ` from \`${queueChannel.name}\`.`
         ).catch(() => null)
         await QueueMemberTable.unstore(
            queueChannel.id,
            queueMembers.map((member) => member.member_id)
         );
         SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      } else {
         await parsed.command.reply(`\`${queueChannel.name}\` is empty.`).catch(() => null);
      }
   }

   // --------------------------------- PERMISSIONS ------------------------------- //

   /**
    * HELPER
    */
   private static async genPermissionList(parsed: Parsed): Promise<string> {
      const perms = await AdminPermissionTable.getMany(parsed.command.guild.id);
      let response = "\n\nRoles and users with bot permission: ";
      if (perms?.length) {
         response += perms.map((status) => "<@" + (status.is_role ? "&" : "") + status.role_member_id + ">").join(", ");
      } else {
         response += "Empty";
      }
      return response;
   }

   /**
    * Grant permission to a role or user to use bot commands
    */
   public static async permissionAdd(parsed: Parsed) {
      const member = parsed.getMemberParam();
      const role = parsed.getRoleParam();
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      let response = "";

      if (await AdminPermissionTable.get(parsed.command.guild.id, id)) {
         response += `\`${name}\` already has bot permission.`;
      } else {
         await AdminPermissionTable.store(parsed.command.guild.id, id, role != null);
         response += `Added bot permission for \`${name}\`.`;
      }
      response += await this.genPermissionList(parsed);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null);
   }

   /**
    * Revoke permission from a role or user to use bot commands
    */
   public static async permissionDelete(parsed: Parsed) {
      const member = parsed.getMemberParam();
      const role = parsed.getRoleParam();
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      let response = "";

      if (await AdminPermissionTable.get(parsed.command.guild.id, id)) {
         await AdminPermissionTable.unstore(parsed.command.guild.id, id);
         response += `Removed bot permission for \`${name}\`.`;
      } else {
         response += `\`${name}\` did not have bot permission.`;
      }
      response += await this.genPermissionList(parsed);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null);
   }

   /**
    * List roles and users with permission
    */
   public static async permissionList(parsed: Parsed) {
      const response = await this.genPermissionList(parsed);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null);
   }

   // --------------------------------- PULLNUM ------------------------------- //

   /**
    * Get the current pullnum settings
    */
   public static async pullnumGet(parsed: Parsed) {
      const storedQueueChannels = await QueueChannelTable.getFromGuild(parsed.command.guild.id);
      let response = "**Pull nums**:\n";
      for await (const storedQueueChannel of storedQueueChannels) {
         const queueChannel = (await parsed.command.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.pull_num}\n`;
      }
      await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
   }

   /**
    * Set the default # of users to pull when autopull is off or when using the `next` command
    */
   public static async pullnumSet(parsed: Parsed) {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;

      const value = parsed.getNumberParam(1, 99);
      await QueueChannelTable.updatePullnum(queueChannel.id, value);
      await parsed.command.reply(`Set pull number of \`${queueChannel.name}\` to \`${value}\`.`).catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- PRIORITY ------------------------------- //

   /**
    * HELPER
    */
   private static async genPriorityList(guildId: Snowflake): Promise<string> {
      const storedEntries = await PriorityTable.getMany(guildId);
      let response = "\n\nPriority list: ";
      if (storedEntries?.length) {
         response += storedEntries.map((entry) => "<@" + (entry.is_role ? "&" : "") + entry.role_member_id + ">").join(", ");
      } else {
         response += "Empty";
      }
      return response;
   }

   /**
    * HELPER
    */
   private static async updatePriorities(parsed: Parsed): Promise<void> {
      const guild = parsed.command.guild;
      // Get all priority Ids for guild
      const priorityIds = (await PriorityTable.getMany(guild.id)).map((entry) => entry.role_member_id);
      // Get all queue channels for guild
      const entries = await QueueChannelTable.getFromGuild(guild.id);
      for await (const entry of entries) {
         const queueChannel = (await guild.channels.fetch(entry.queue_channel_id).catch(() => null)) as VoiceChannel | TextChannel;
         if (!queueChannel) continue;
         // Get members for each queue channel
         const entries = await QueueMemberTable.getFromQueue(queueChannel);
         for await (const entry of entries) {
            const queueMember = await guild.members.fetch(entry.member_id).catch(() => null as GuildMember);
            if (!queueMember) continue;
            // Re-evaluate priority for each member
            const roleIds = queueMember.roles.cache.keyArray();
            if ([queueMember.id, ...roleIds].some((id) => priorityIds.includes(id))) {
               QueueMemberTable.setPriority(queueChannel.id, queueMember.id, true);
            } else {
               QueueMemberTable.setPriority(queueChannel.id, queueMember.id, false);
            }
         }
         // Schedule display update for each queue
         SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      }
   }

   /**
    *
    */
   public static async priorityAdd(parsed: Parsed): Promise<void> {
      const member = parsed.getMemberParam();
      const role = parsed.getRoleParam();
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      const guildId = parsed.command.guild.id;
      let response = "";

      if (await PriorityTable.get(guildId, id)) {
         response += `\`${name}\` is already on the priority list.`;
      } else {
         await PriorityTable.store(guildId, id, role != null);
         response += `Added \`${name}\` to the the priority list.`;
      }

      response += await this.genPriorityList(guildId);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null);
      this.updatePriorities(parsed);
   }

   /**
    *
    */
   public static async priorityDelete(parsed: Parsed): Promise<void> {
      const member = parsed.getMemberParam();
      const role = parsed.getRoleParam();
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      const guildId = parsed.command.guild.id;
      let response = "";

      if (await PriorityTable.get(guildId, id)) {
         await PriorityTable.unstore(guildId, id);
         response += `Removed \`${name}\` from the priority list.`;
      } else {
         response += `\`${name}\` was not on the priority list.`;
      }

      response += await this.genPriorityList(guildId);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null)
      this.updatePriorities(parsed);
   }

   /**
    *
    */
   public static async priorityList(parsed: Parsed): Promise<void> {
      const response = await this.genPriorityList(parsed.command.guild.id);
      await parsed.command.reply({ content: response, allowedMentions: { users: [] } }).catch(() => null)
   }

   // --------------------------------- QUEUES ------------------------------- //

   /**
    * HELPER
    */
   private static async genQueuesList(parsed: Parsed): Promise<string> {
      const storedChannels = await QueueChannelTable.fetchFromGuild(parsed.command.guild);
      if (storedChannels?.length) {
         return "\n\nQueues: " + storedChannels.map((ch) => `\`${ch.name}\``).join(", ");
      } else {
         return "\n\nNo queue channels set. Set a new queue channel using `/queues add`.";
      }
   }

   /**
    * Add a new queue
    */
   public static async queuesAdd(parsed: Parsed): Promise<void> {
      const channel = parsed.getChannelParam();
      if (!channel) return;

      const storedChannels = await QueueChannelTable.fetchFromGuild(parsed.command.guild);

      if (storedChannels.some((stored) => stored.id === channel.id)) {
         const response = `\`${channel.name}\` is already a queue.`;
         await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
      } else {
         const size = parsed.getNumberParam(1, 99) || (channel as VoiceChannel).userLimit;
         if (channel.type === "GUILD_VOICE") {
            if (channel.permissionsFor(parsed.command.guild.me).has("CONNECT")) {
               await QueueChannelTable.store(parsed, channel, size);
               const response = `Created \`${channel.name}\` queue.` + (await this.genQueuesList(parsed));
               await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
               if (size) {
                  if (channel.permissionsFor(parsed.command.guild.me).has("MANAGE_CHANNELS")) {
                     (channel as VoiceChannel).setUserLimit(size).catch(() => null);
                  } else {
                     setTimeout(
                        () =>
                           parsed.command.followUp({
                              content:
                                 "I can automatically set voice channel user limits, but I need a new permission:\n" +
                                 "`Server Settings` > `Roles` > `Queue Bot` >  `Permissions` tab > enable `Manage Channels`.\n" +
                                 "If that does not work, check the channel-specific permissions.",
                              ephemeral: true,
                           }),
                        2000
                     );
                  }
               }
            } else {
               await parsed.command.reply({
                  content: `**ERROR**: I need the **CONNECT** permission in the \`${channel.name}\` voice channel to pull in queue members.`,
                  ephemeral: true,
               }).catch(() => null);
            }
         } else {
            await QueueChannelTable.store(parsed, channel, size);
            const response = `Created \`${channel.name}\` queue.` + (await this.genQueuesList(parsed));
            await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
         }
      }
   }

   /**
    * Delete a queue
    */
   public static async queuesDelete(parsed: Parsed): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;

      await QueueChannelTable.unstore(parsed.command.guild.id, queueChannel.id);
      const response = `Deleted queue for \`${queueChannel.name}\`.` + (await this.genQueuesList(parsed));
      await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
      Voice.disconnectFromChannel(queueChannel as VoiceChannel);
   }

   /**
    * List queues
    */
   public static async queuesList(parsed: Parsed): Promise<void> {
      const response = await this.genQueuesList(parsed);
      await parsed.command.reply(response).catch(() => null);
   }

   // --------------------------------- SHUFFLE ------------------------------- //

   /**
    * HELPER
    * Shuffle array using the Fisher-Yates algorithm
    */
   private static shuffleArray(array: string[]): void {
      for (let i = array.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [array[i], array[j]] = [array[j], array[i]];
      }
   }

   /**
    * Shuffle a queue
    */
   public static async shuffle(parsed: Parsed): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;

      const queueMembers = await QueueMemberTable.getFromQueue(queueChannel);
      const queueMemberTimeStamps = queueMembers.map((member) => member.created_at);
      this.shuffleArray(queueMemberTimeStamps);
      for (let i = 0; i < queueMembers.length; i++) {
         await QueueMemberTable.setCreatedAt(queueMembers[i].id, queueMemberTimeStamps[i]);
      }
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      await parsed.command.reply(`\`${queueChannel.name}\` queue shuffled.`).catch(() => null);
   }

   // --------------------------------- SIZE ------------------------------- //

   /**
    * Get the current queue sizes
    */
   public static async sizeGet(parsed: Parsed) {
      const storedQueueChannels = await QueueChannelTable.getFromGuild(parsed.command.guild.id);
      let response = "**Sizes**:\n";
      for await (const storedQueueChannel of storedQueueChannels) {
         const queueChannel = (await parsed.command.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.max_members || "none"}\n`;
      }
      await parsed.command.reply({ content: response, ephemeral: true }).catch(() => null);
   }

   /**
    * Set the size of a queue
    */
   public static async sizeSet(parsed: Parsed): Promise<void> {
      const queueChannel = await ParsingUtils.getStoredQueue(parsed);
      if (!queueChannel) return;
      let max = parsed.getNumberParam(1, 99);

      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      await QueueChannelTable.updateMaxMembers(queueChannel.id, max);
      await parsed.command.reply(`Set \`${queueChannel.name}\` size to \`${max}\` users.`).catch(() => null);
      if (queueChannel.type === "GUILD_VOICE") {
         if (queueChannel.permissionsFor(parsed.command.guild.me).has("MANAGE_CHANNELS")) {
            (queueChannel as VoiceChannel).setUserLimit(max).catch(() => null);
         } else {
            parsed.command.followUp({
               content:
                  "I can automatically change the user limit of voice channels, but I need a new permission:\n" +
                  "`Server Settings` > `Roles` > `Queue Bot` > `Permissions` tab > enable `Manage Channels`.\n" +
                  "If that does'nt work, check the channel-specific permissions.",
               ephemeral: true,
            });
         }
      }
   }

   // --------------------------------- START ------------------------------- //

   /**
    * Add the bot to a voice queue
    */
   public static async start(parsed: Parsed): Promise<void> {
      const queueChannel = (await ParsingUtils.getStoredQueue(parsed, "GUILD_VOICE")) as VoiceChannel;
      if (!queueChannel) return;

      if (queueChannel.permissionsFor(parsed.command.guild.me).has("CONNECT")) {
         if (!queueChannel.full) {
            await Voice.connectToChannel(queueChannel).catch(() => null);
            await parsed.command.reply("Started.").catch(() => null);
         } else {
            await parsed.command.reply({ content: `**ERROR**: I can't join \`${queueChannel.name}\` because it is full.`, ephemeral: true }).catch(() => null);
         }
      } else {
         await parsed.command.reply({ content: `**ERROR**: I don't have permission to join ${queueChannel.name}.`, ephemeral: true }).catch(() => null);
      }
   }
}
