import {
   TextChannel,
   VoiceChannel,
   GuildMember,
   MessageEmbed,
   MessageEmbedOptions,
   ColorResolvable,
   StageChannel,
   DiscordAPIError,
} from "discord.js";
import { BlackWhiteListEntry, PriorityEntry, QueueChannel, QueueGuild } from "./utilities/Interfaces";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { ParsedCommand, ParsedMessage } from "./utilities/ParsingUtils";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { SchedulingUtils } from "./utilities/SchedulingUtils";
import { Voice } from "./utilities/VoiceUtils";
import { AdminPermissionTable } from "./utilities/tables/AdminPermissionTable";
import { BlackWhiteListTable } from "./utilities/tables/BlackWhiteListTable";
import { PriorityTable } from "./utilities/tables/PriorityTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { SlashCommands } from "./utilities/SlashCommands";

export class Commands {
   // --------------------------------- ENABLE PREFIX ------------------------------- //

   /**
    * Enable or disable alternate prefix
    */
   public static async altPrefix(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      if ((await parsed.readArgs({ commandNameLength: 9, hasText: true })).length) return;

      if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
         await parsed
            .reply({
               content: "**ERROR**: Missing required argument: `on` or `off`.",
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
         return;
      }
      if (
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
         await QueueGuildTable.updateAltPrefix(parsed.request.guild.id, parsed.args.text === "on");
         await parsed
            .reply({
               content: `Alternative prefixes have been turned ${parsed.args.text}.`,
            })
            .catch(() => null);
      }
   }

   // --------------------------------- AUTOPULL ------------------------------- //

   /**
    * Get the current autopull settings
    */
   public static async autopullGet(parsed: ParsedCommand | ParsedMessage) {
      if ((await parsed.readArgs({ commandNameLength: 12 })).length) return;

      let response = "**Autopull**:\n";
      for await (const storedQueueChannel of await parsed.getStoredQueueChannels()) {
         const queueChannel = (await parsed.request.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel?.type)) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.auto_fill ? "on" : "off"}\n`;
      }
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Toggle automatic pull of users from a queue
    */
   public static async autopullSet(parsed: ParsedCommand | ParsedMessage) {
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
         return;
      }

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;

      const value = parsed.args.text === "off" ? 0 : 1;
      await QueueChannelTable.updateAutopull(queueChannel.id, value);
      await parsed
         .reply({
            content: `Set autopull of \`${queueChannel.name}\` to \`${parsed.args.text}\`.`,
         })
         .catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- BLACKLIST / WHITELIST ------------------------------- //\

   /**
    * HELPER
    */
   private static async validateBlacklistWhitelist(
      parsed: ParsedCommand | ParsedMessage,
      type: number,
      storedEntries: BlackWhiteListEntry[]
   ) {
      let removedAny = false;
      for await (const entry of storedEntries) {
         await parsed.request.guild.members.fetch(entry.role_member_id).catch(async (e: DiscordAPIError) => {
            if ([403, 404].includes(e.httpStatus)) {
               await BlackWhiteListTable.unstore(type, entry.queue_channel_id, entry.role_member_id);
               removedAny = true;
            }
         });
      }
      if (removedAny) {
         setTimeout(async () => await parsed.reply({
            content: `Removed 1 or more invalid members/roles from the ${type ? "white" : "black"}list.`,
         }).catch(() => null), 1000);
      }
   }

   /**
    * HELPER
    */
   private static async genBlacklistWhitelist(parsed: ParsedCommand | ParsedMessage, type: number): Promise<string> {
      const typeString = type ? "White" : "Black";
      const storedEntries = await BlackWhiteListTable.getMany(type, parsed.args.channel.id);
      this.validateBlacklistWhitelist(parsed, type, storedEntries);

      let response = `\n${typeString}list of \`${parsed.args.channel.name}\`: `;
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
   private static async blacklistWhitelistAdd(parsed: ParsedCommand | ParsedMessage, type: number): Promise<void> {
      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;
      const member = parsed.args.member;
      const role = parsed.args.role;
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
            const members = role ? Array.from(role.members.values()) : [member];
            await this.kickFromQueue(parsed.queueGuild, queueChannel, members);
         }
         response += `Added \`${name}\` to the ${typeString}list of \`${queueChannel.name}\`.`;
      }

      response += await this.genBlacklistWhitelist(parsed, type);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Add a user or role to a queue's blacklist
    */
   public static async blacklistAddUser(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      if ((await parsed.readArgs({ commandNameLength: 18, hasChannel: true, hasMember: true })).length) return;

      this.blacklistWhitelistAdd(parsed, 0);
   }

   /**
    * Add a user or role to a queue's blacklist
    */
   public static async blacklistAddRole(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      if ((await parsed.readArgs({ commandNameLength: 18, hasChannel: true, hasRole: true })).length) return;

      this.blacklistWhitelistAdd(parsed, 0);
   }

   /**
    * HELPER
    */
   private static async blacklistWhitelistDelete(parsed: ParsedCommand | ParsedMessage, type: number): Promise<void> {
      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;
      const member = parsed.args.member;
      const role = parsed.args.role;
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

      response += await this.genBlacklistWhitelist(parsed, type);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Remove a user from a queue's blacklist
    */
   public static async blacklistDeleteUser(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      if ((await parsed.readArgs({ commandNameLength: 21, hasChannel: true, hasMember: true })).length) return;

      this.blacklistWhitelistDelete(parsed, 0);
   }

   /**
    * Remove a role from a queue's blacklist
    */
   public static async blacklistDeleteRole(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      if ((await parsed.readArgs({ commandNameLength: 21, hasChannel: true, hasRole: true })).length) return;

      this.blacklistWhitelistDelete(parsed, 0);
   }

   /**
    * HELPER
    */
   private static async blacklistWhitelistList(parsed: ParsedCommand | ParsedMessage, type: number): Promise<void> {
      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;
      const response = await this.genBlacklistWhitelist(parsed, type);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Display a queue's blacklist
    */
   public static async blacklistList(parsed: ParsedCommand | ParsedMessage) {
      if ((await parsed.readArgs({ commandNameLength: 14, hasChannel: true })).length) return;

      this.blacklistWhitelistList(parsed, 0);
   }

   // --------------------------------- BUTTON ------------------------------- //

   /**
    * Get button settings
    */
   public static async buttonGet(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 10 });

      let response = "**Buttons**:\n";
      for await (const storedQueueChannel of await parsed.getStoredQueueChannels()) {
         const queueChannel = (await parsed.request.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!["GUILD_TEXT"].includes(queueChannel?.type)) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.hide_button ? "on" : "off"}\n`;
      }
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Enable or disable the "Join / Leave" button for a queue
    */
   public static async buttonSet(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 10, hasChannel: true, channelType: ["GUILD_TEXT"], hasText: true });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;

      if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
         await parsed
            .reply({
               content: "**ERROR**: Missing required argument: `on` or `off`.",
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
         return;
      }

      await QueueChannelTable.updateHideButton(queueChannel.id, parsed.args.text === "off");
      await parsed
         .reply({
            content: `Set button of \`${queueChannel.name}\` to \`${parsed.args.text}\`.`,
         })
         .catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- CLEAR ------------------------------- //

   /**
    * Clear a queue
    */
   public static async clear(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 5, hasChannel: true });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;

      await QueueMemberTable.unstore(queueChannel.guild.id, queueChannel.id);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      await parsed
         .reply({
            content: `\`${queueChannel.name}\` queue cleared.`,
         })
         .catch(() => null);
   }

   // --------------------------------- COLOR ------------------------------- //

   /**
    * Get the current color settings
    */
   public static async colorGet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 9 });

      let response = "**Colors**:\n";
      for await (const storedQueueChannel of await parsed.getStoredQueueChannels()) {
         const queueChannel = (await parsed.request.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.color}\n`;
      }
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Set a new color for a queue
    */
   public static async colorSet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 9, hasChannel: true, hasText: true });
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
      if (!queueChannel?.id) return;

      await QueueChannelTable.updateColor(queueChannel, parsed.args.text.toUpperCase() as ColorResolvable);
      await parsed
         .reply({
            content: `Set color of \`${queueChannel.name}\` to \`${parsed.args.text}\`.`,
         })
         .catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- DISPLAY ------------------------------- //

   /**
    * Display the users in a queue. These messages stay updated
    */
   public static async display(parsed: ParsedCommand | ParsedMessage, channel?: VoiceChannel | StageChannel | TextChannel): Promise<void> {
      await parsed.readArgs({ commandNameLength: 7, hasChannel: true });

      const queueChannel = channel || parsed.args.channel;
      if (!queueChannel) return;
      const author = parsed.request.member as GuildMember;
      if (!author?.id) return;

      const displayChannel = parsed.request.channel as TextChannel;
      const displayPermission = displayChannel.permissionsFor(displayChannel.guild.me);
      if (displayPermission.has("SEND_MESSAGES") && displayPermission.has("EMBED_LINKS")) {
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

      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id).catch(() => null as QueueChannel);
      if (!storedQueueChannel?.role_id) {
         const role = await QueueChannelTable.createQueueRole(parsed, queueChannel, storedQueueChannel.color);
         if (role) await QueueChannelTable.updateRoleId(queueChannel, role);
      }
   }

   // --------------------------------- ENQUEUE ------------------------------- //

   /**
    * HELPER
    */
   private static async enqueue(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      const queueChannel = parsed.args.channel as TextChannel;
      if (!queueChannel?.id) return;
      const customMessage = parsed.args.text?.substring(0, 128);

      const member = parsed.args.member;
      const role = parsed.args.role;
      if (member?.id) {
         try {
            await QueueMemberTable.store(queueChannel, member, customMessage, true);
            await parsed
               .reply({
                  content: `Added <@${member.id}> to \`${queueChannel.name}\`.`,
               })
               .catch(() => null);
            SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
         } catch (e) {
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
         for await (const member of role.members.values()) {
            try {
               await QueueMemberTable.store(queueChannel, member, customMessage, true);
            } catch (e) {
               if (e.author === "Queue Bot") {
                  errorAccumulator += e.message;
               } else {
                  throw e;
               }
            }
         }
         const errorText = errorAccumulator ? "However, failed to add 1 or more members:\n" + errorAccumulator : "";
         await parsed
            .reply({
               content: `Added <@&${role.id}> to \`${queueChannel.name}\`.` + errorText,
            })
            .catch(() => null);
         SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      }
   }

   /**
    * Add a specified user to a queue
    */
   public static async enqueueUser(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 12, hasChannel: true, channelType: ["GUILD_TEXT"], hasMember: true });

      await this.enqueue(parsed);
   }

   /**
    * Add a specified role to a queue
    */
   public static async enqueueRole(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 12, hasChannel: true, channelType: ["GUILD_TEXT"], hasRole: true });

      await this.enqueue(parsed);
   }

   // --------------------------------- GRACEPERIOD ------------------------------- //

   /**
    * Get the current grace period settings
    */
   public static async graceperiodGet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 15 });

      let response = "**Grace Periods**:\n";
      for await (const storedQueueChannel of await parsed.getStoredQueueChannels()) {
         const queueChannel = (await parsed.request.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!queueChannel) continue;
         const timeString = await MessagingUtils.getGracePeriodString(storedQueueChannel.grace_period);
         response += `\`${queueChannel.name}\`: ${timeString || "0 seconds"}\n`;
      }
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Set how long a user can leave a queue before losing their spot
    */
   public static async graceperiodSet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({
         commandNameLength: 15,
         hasChannel: true,
         hasNumber: true,
         numberArgs: { min: 0, max: 6000, defaultValue: null },
      });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;

      await QueueChannelTable.updateGraceperiod(queueChannel.id, parsed.args.num);
      const timeString = await MessagingUtils.getGracePeriodString(parsed.args.num);
      await parsed
         .reply({
            content: `Set grace period of \`${queueChannel.name}\` to \`${timeString || "0 seconds"}\`.`,
         })
         .catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- HEADER ------------------------------- //

   /**
    * Set or remove a header for a queue's display messages
    */
   public static async headerGet(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 10 });

      let response = "**Headers**:\n";
      for await (const storedQueueChannel of await parsed.getStoredQueueChannels()) {
         const queueChannel = (await parsed.request.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.header || "none"}\n`;
      }
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Set or remove a header for a queue's display messages
    */
   public static async headerSet(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 10, hasChannel: true });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;
      const message = parsed.args.text || "";

      await QueueChannelTable.updateHeader(queueChannel.id, message);
      await parsed
         .reply({
            content: `Updated \`${queueChannel.name}\` header.`,
         })
         .catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- HELP ------------------------------- //

   /**
    * Display general help messages
    */
   public static async help(parsed: ParsedCommand | ParsedMessage): Promise<void> {
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
               name: "`/join`" + (alt ? " or `!join`" : ""),
               value: "Join a text queue",
            },
            {
               name: "`/leave`" + (alt ? " or `!leave`" : ""),
               value: "Leave a text queue",
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
   public static async helpQueue(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 10 });

      const response: MessageEmbedOptions = {
         author: { name: "Privileged Commands" },
         title: "Queue Management",
         fields: [
            {
               name: "`/altprefix`",
               value: "Enable or disable alternate prefix `!`",
            },
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
               name: "`/display`",
               value: "Display a queue",
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
               name: "`/kick`",
               value: "Kick a user from a queue",
            },
            {
               name: "`/kick all`",
               value: "Kick a user from all queue",
            },
            {
               name: "`/mentions`",
               value: "Get / Set whether users are displayed as mentions (on), or normal text (off). Normal text helps avoid the @invalid-user issue",
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
   public static async helpBot(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 8 });

      const response: MessageEmbedOptions = {
         author: { name: "Privileged Commands" },
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
   public static async helpSetup(parsed: ParsedCommand | ParsedMessage): Promise<void> {
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
    * Join a text queue
    */
   public static async join(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 4, hasChannel: true, channelType: ["GUILD_TEXT"] });

      const queueChannel = parsed.args.channel as TextChannel;
      if (!queueChannel?.id) return;
      const author = parsed.request.member as GuildMember;
      if (!author?.id) return;

      const customMessage = parsed.args.text?.substring(0, 128);

      try {
         await QueueMemberTable.store(queueChannel, author, customMessage);
         await parsed
            .reply({
               content: `You joined \`${queueChannel.name}\`.`,
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
      } catch (e) {
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

      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- KICK ------------------------------- //

   /**
    * HELPER
    */
   private static async kickFromQueue(
      queueGuild: QueueGuild,
      channel: TextChannel | VoiceChannel | StageChannel,
      members: GuildMember[]
   ): Promise<void> {
      if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(channel.type)) {
         for await (const member of members) {
            await member?.voice?.disconnect().catch(() => null);
         }
      } else {
         await QueueMemberTable.unstore(
            queueGuild.guild_id,
            channel.id,
            members.map((m) => m.id)
         );
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, channel);
      }
   }

   /**
    * Kick a user from a specified queue
    */
   public static async kick(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 4, hasChannel: true, hasMember: true });

      const member = parsed.args.member;
      const channel = parsed.args.channel;
      if (!member?.id || !channel?.id) return;

      await this.kickFromQueue(parsed.queueGuild, channel, [member]);
      await parsed
         .reply({
            content: `Kicked <@${member.id}> from \`${channel.name}\` queue.`,
         })
         .catch(() => null);
   }

   // --------------------------------- KICKALL ------------------------------- //

   /**
    * Kick a user from all queues
    */
   public static async kickAll(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 7, hasMember: true });

      const member = parsed.args.member;
      if (!member?.id) return;

      const channels: (VoiceChannel | StageChannel | TextChannel)[] = [];
      const storedChannelIds = (await QueueChannelTable.getFromGuild(member.guild.id)).map((ch) => ch.queue_channel_id);
      const storedEntries = await QueueMemberTable.getFromChannels(storedChannelIds, member.id);

      for await (const entry of storedEntries) {
         const queueChannel = (await parsed.request.guild.channels.fetch(entry.channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!queueChannel) continue;
         channels.push(queueChannel);
         await this.kickFromQueue(parsed.queueGuild, queueChannel, [member]);
      }
      await parsed
         .reply({
            content: `Kicked <@${member.id}> from ` + channels.map((ch) => `\`${ch.name}\``).join(", ") + " queues.",
         })
         .catch(() => null);
   }

   // --------------------------------- LEAVE ------------------------------- //

   /**
    * Leave a text queue
    */
   public static async leave(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 5, hasChannel: true, channelType: ["GUILD_TEXT"] });

      const queueChannel = parsed.args.channel as TextChannel;
      if (!queueChannel?.id) return;
      const author = parsed.request.member as GuildMember;
      if (!author?.id) return;

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

      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- MENTIONS ------------------------------- //

   /**
    * Get the current mentions settings
    */
   public static async mentionsGet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 12 });

      await parsed
         .reply({
            content: "**Mentions**: " + parsed.queueGuild.disable_mentions ? "off" : "on",
         })
         .catch(() => null);
   }

   /**
    * Enable or disable mentions in queue displays
    */
   public static async mentionsSet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 12, hasText: true });

      if (!["on", "off"].includes(parsed.args.text.toLowerCase())) {
         await parsed
            .reply({
               content: "**ERROR**: Missing required argument: `on` or `off`.",
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
         return;
      }

      const guild = parsed.request.guild;
      const disableMentions = parsed.args.text === "on" ? false : true;
      await QueueGuildTable.updateDisableMentions(guild.id, disableMentions);
      await parsed
         .reply({
            content: `Set mentions to \`${parsed.args.text}\`.`,
         })
         .catch(() => null);
      const storedQueueChannels = await QueueChannelTable.getFromGuild(guild.id);
      for (const storedQueueChannel of storedQueueChannels) {
         const queueChannel = (await guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      }
   }

   // --------------------------------- MODE ------------------------------- //

   /**
    * Get the current autopull settings
    */
   public static async modeGet(parsed: ParsedCommand | ParsedMessage) {
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
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Toggle automatic pull of users from a queue
    */
   public static async modeSet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 8, hasNumber: true, numberArgs: { min: 1, max: 3, defaultValue: 1 } });

      if (![1, 2, 3].includes(parsed.args.num)) {
         await parsed
            .reply({
               content: "**ERROR**: Missing required argument: `1`, `2`, or `3`.",
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
         return;
      }

      await QueueGuildTable.updateMessageMode(parsed.request.guild.id, parsed.args.num);
      await parsed
         .reply({
            content: `Set messaging mode to \`${parsed.args.num}\`.`,
         })
         .catch(() => null);
   }

   // --------------------------------- MYQUEUES ------------------------------- //

   /**
    * Display the queues you are in with your position
    */
   public static async myqueues(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 8 });

      const author = parsed.request.member as GuildMember;
      if (!author?.id) return;

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
            const queueChannel = (await author.guild.channels.fetch(entry.channel_id).catch(() => null)) as
               | VoiceChannel
               | StageChannel
               | TextChannel;
            if (!queueChannel) continue;
            const memberIds = (await QueueMemberTable.getNext(queueChannel)).map((member) => member.member_id);
            embed.addField(
               queueChannel.name,
               `${memberIds.indexOf(author.id) + 1} <@${author.id}>` + (entry.personal_message ? ` -- ${entry.personal_message}` : "")
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
    * Pull a specified # of user(s) from a queue and display their name(s)
    */
   public static async next(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 4, hasChannel: true, numberArgs: { min: 1, max: 99, defaultValue: null } });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;
      const storedQueueChannel = parsed.queueChannels.find((ch) => ch.queue_channel_id === queueChannel.id);
      if (!storedQueueChannel) return;

      // Get the oldest member entries for the queue
      const amount = parsed.args.num || storedQueueChannel.pull_num || 1;
      let queueMembers = await QueueMemberTable.getNext(queueChannel, amount);

      if (queueMembers.length > 0) {
         // Display and remove member from the the queue
         if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(queueChannel.type)) {
            const targetChannel = (await queueChannel.guild.channels.fetch(storedQueueChannel.target_channel_id).catch(() => null)) as
               | VoiceChannel
               | StageChannel;
            if (targetChannel) {
               for (const queueMember of queueMembers) {
                  const member = await QueueMemberTable.getMemberFromQueueMember(queueChannel, queueMember);
                  if (!member) continue;
                  SchedulingUtils.scheduleMoveMember(member.voice, targetChannel);
               }
            } else {
               await parsed
                  .reply({
                     content:
                        "**ERROR**: No target channel. Set a target channel by sending `/start` then dragging the bot to the target channel.",
                     commandDisplay: "EPHEMERAL",
                  })
                  .catch(() => null);
               return;
            }
         } else {
            for (const queueMember of queueMembers) {
               const member = await QueueMemberTable.getMemberFromQueueMember(queueChannel, queueMember);
               if (!member) continue;
               await member
                  .send(
                     `You were just pulled from the \`${queueChannel.name}\` queue ` +
                        `in \`${queueChannel.guild.name}\`. Thanks for waiting!`
                  )
                  .catch(() => null);
            }
         }
         await parsed
            .reply({
               content: `Pulled ` + queueMembers.map((member) => `<@${member.member_id}>`).join(", ") + ` from \`${queueChannel.name}\`.`,
            })
            .catch(() => null);
         await QueueMemberTable.unstore(
            queueChannel.guild.id,
            queueChannel.id,
            queueMembers.map((member) => member.member_id)
         );
         SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      } else {
         await parsed
            .reply({
               content: `\`${queueChannel.name}\` is empty.`,
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
      }
   }

   // --------------------------------- PERMISSIONS ------------------------------- //

   /**
    * HELPER
    */
   private static async genPermissionList(parsed: ParsedCommand | ParsedMessage): Promise<string> {
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
   private static async permissionAdd(parsed: ParsedCommand | ParsedMessage) {
      const member = parsed.args.member;
      const role = parsed.args.role;
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      let response = "";

      if (await AdminPermissionTable.get(parsed.request.guild.id, id)) {
         response += `\`${name}\` already has bot permission.`;
      } else {
         await AdminPermissionTable.store(parsed.request.guild.id, id, role != null);
         response += `Added bot permission for \`${name}\`.`;
      }
      response += await this.genPermissionList(parsed);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Grant permission to a user to use bot commands
    */
   public static async permissionAddUser(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 19, hasMember: true });

      await this.permissionAdd(parsed);
   }

   /**
    * Grant permission to a role to use bot commands
    */
   public static async permissionAddRole(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 19, hasRole: true });

      await this.permissionAdd(parsed);
   }

   /**
    * HELPER
    */
   private static async permissionDelete(parsed: ParsedCommand | ParsedMessage) {
      const member = parsed.args.member;
      const role = parsed.args.role;
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      let response = "";

      if (await AdminPermissionTable.get(parsed.request.guild.id, id)) {
         await AdminPermissionTable.unstore(parsed.request.guild.id, id);
         response += `Removed bot permission for \`${name}\`.`;
      } else {
         response += `\`${name}\` did not have bot permission.`;
      }
      response += await this.genPermissionList(parsed);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Revoke permission from a user to use bot commands
    */
   public static async permissionDeleteUser(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 22, hasMember: true });

      await this.permissionDelete(parsed);
   }

   /**
    * Revoke permission from a role to use bot commands
    */
   public static async permissionDeleteRole(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 22, hasRole: true });

      await this.permissionDelete(parsed);
   }

   /**
    * List roles and users with permission
    */
   public static async permissionList(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 20 });

      const response = await this.genPermissionList(parsed);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   // --------------------------------- PRIORITY ------------------------------- //

   /**
    * HELPER
    */
   private static async validatePriorityList(parsed: ParsedCommand | ParsedMessage, storedEntries: PriorityEntry[]) {
      let removedAny = false;
      for await (const entry of storedEntries) {
         if (entry.is_role) continue;
         await parsed.request.guild.members.fetch(entry.role_member_id).catch(async (e: DiscordAPIError) => {
            console.log(e);
            if ([403, 404].includes(e.httpStatus)) {
               await PriorityTable.unstore(parsed.queueGuild.guild_id, entry.role_member_id);
               removedAny = true;
            }
         });
         console.log(entry.role_member_id);
      }
      if (removedAny) {
         setTimeout(async () => await parsed.reply({
            content: `Removed 1 or more invalid members/roles from the priority list.`,
         }).catch(() => null), 1000);
      }
   }

   /**
    * HELPER
    */
   private static async genPriorityList(parsed: ParsedCommand | ParsedMessage): Promise<string> {
      const storedEntries = await PriorityTable.getMany(parsed.queueGuild.guild_id);
      this.validatePriorityList(parsed, storedEntries);
      let response = "\nPriority list: ";
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
   private static async updatePriorities(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      const guild = parsed.request.guild;
      // Get all priority Ids for guild
      const priorityIds = (await PriorityTable.getMany(guild.id)).map((entry) => entry.role_member_id);
      // Get all queue channels for guild
      for await (const storedChannel of await parsed.getStoredQueueChannels()) {
         const queueChannel = (await guild.channels.fetch(storedChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!queueChannel) continue;
         // Get members for each queue channel
         const storedMembers = await QueueMemberTable.getFromQueue(queueChannel);
         for await (const storedMember of storedMembers) {
            const queueMember = await QueueMemberTable.getMemberFromQueueMember(queueChannel, storedMember);
            if (!queueMember) continue;
            // Re-evaluate priority for each member
            const roleIds = queueMember.roles.cache.keys();
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
    * HELPER
    */
   private static async priorityAdd(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      const member = parsed.args.member;
      const role = parsed.args.role;
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      const guildId = parsed.request.guild.id;
      let response = "";

      if (await PriorityTable.get(guildId, id)) {
         response += `\`${name}\` is already on the priority list.`;
      } else {
         await PriorityTable.store(guildId, id, role != null);
         response += `Added \`${name}\` to the the priority list.`;
         this.updatePriorities(parsed);
      }

      response += await this.genPriorityList(parsed);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Grant priority in queue to a user
    */
   public static async priorityAddUser(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 17, hasMember: true });

      await this.priorityAdd(parsed);
   }

   /**
    * Grant priority in queue to a role
    */
   public static async priorityAddRole(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 17, hasRole: true });

      await this.priorityAdd(parsed);
   }

   /**
    * HELPER
    */
   private static async priorityDelete(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      const member = parsed.args.member;
      const role = parsed.args.role;
      const id = member?.id || role?.id;
      if (!id) return;
      const name = member?.displayName || role?.name;
      const guildId = parsed.request.guild.id;
      let response = "";

      if (await PriorityTable.get(guildId, id)) {
         await PriorityTable.unstore(guildId, id);
         response += `Removed \`${name}\` from the priority list.`;
         this.updatePriorities(parsed);
      } else {
         response += `\`${name}\` was not on the priority list.`;
      }

      response += await this.genPriorityList(parsed);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Revoke priority in queue from a user
    */
   public static async priorityDeleteUser(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 17, hasMember: true });

      await this.priorityDelete(parsed);
   }

   /**
    * Revoke priority in queue from a role
    */
   public static async priorityDeleteRole(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 17, hasRole: true });

      await this.priorityDelete(parsed);
   }

   /**
    * List roles and users with priority in queue
    */
   public static async priorityList(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 13 });

      const response = await this.genPriorityList(parsed);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   // --------------------------------- PULLNUM ------------------------------- //

   /**
    * Get the current pullnum settings
    */
   public static async pullnumGet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 11 });

      let response = "**Pull nums**:\n";
      for await (const storedQueueChannel of await parsed.getStoredQueueChannels()) {
         const queueChannel = (await parsed.request.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.pull_num}\n`;
      }
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Set the default # of users to pull when autopull is off or when using the `next` command
    */
   public static async pullnumSet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 11, hasChannel: true, hasNumber: true, numberArgs: { min: 1, max: 99, defaultValue: 1 } });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;

      const value = parsed.args.num;
      await QueueChannelTable.updatePullnum(queueChannel.id, value);
      await parsed
         .reply({
            content: `Set pull number of \`${queueChannel.name}\` to \`${value}\`.`,
         })
         .catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }

   // --------------------------------- QUEUES ------------------------------- //

   /**
    * HELPER
    */
   private static async genQueuesList(parsed: ParsedCommand | ParsedMessage): Promise<string> {
      const storedChannels = await QueueChannelTable.fetchFromGuild(parsed.request.guild);
      if (storedChannels?.length) {
         return "\nQueues: " + storedChannels.map((ch) => `\`${ch.name}\``).join(", ");
      } else {
         return "\nNo queue channels set. Set a new queue channel using `/queues add`.";
      }
   }

   /**
    * HELPER
    */
   private static async storeQueue(
      parsed: ParsedCommand | ParsedMessage,
      channel: VoiceChannel | StageChannel | TextChannel,
      size: number
   ): Promise<void> {
      await QueueChannelTable.store(parsed, channel, size);
      await parsed
         .reply({
            content: `Created \`${channel.name}\` queue.` + (await this.genQueuesList(parsed)),
         })
         .catch(() => null);
      await SlashCommands.modifyCommandsForGuild(parsed.request.guild, parsed);
   }

   /**
    * Add a new queue
    */
   public static async queuesAdd(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 10, hasChannel: true, numberArgs: { min: 1, max: 99, defaultValue: null } });

      const channel = parsed.args.channel;
      if (!channel) return;

      const storedChannels = await QueueChannelTable.fetchFromGuild(parsed.request.guild);

      if (storedChannels.some((stored) => stored.id === channel.id)) {
         await parsed
            .reply({
               content: `\`${channel.name}\` is already a queue.`,
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
      } else {
         const size = parsed.args.num || (channel as VoiceChannel | StageChannel).userLimit;
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
                        2000
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
   public static async queuesDelete(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 13, hasChannel: true });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;

      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      if (storedQueueChannel) {
         await QueueChannelTable.unstore(parsed.request.guild.id, queueChannel.id, parsed);
         const response = `Deleted queue for \`${queueChannel.name}\`.` + (await this.genQueuesList(parsed));
         await parsed
            .reply({
               content: response,
            })
            .catch(() => null);
         Voice.disconnectFromChannel(queueChannel as VoiceChannel | StageChannel);

         await SlashCommands.modifyCommandsForGuild(parsed.request.guild, parsed);
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
   public static async queuesList(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 11 });

      const response = await this.genQueuesList(parsed);
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
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
   public static async shuffle(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 7, hasChannel: true });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;

      const queueMembers = await QueueMemberTable.getFromQueue(queueChannel);
      const queueMemberTimeStamps = queueMembers.map((member) => member.created_at);
      this.shuffleArray(queueMemberTimeStamps);
      for (let i = 0; i < queueMembers.length; i++) {
         await QueueMemberTable.setCreatedAt(queueMembers[i].id, queueMemberTimeStamps[i]);
      }
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      await parsed
         .reply({
            content: `\`${queueChannel.name}\` queue shuffled.`,
         })
         .catch(() => null);
   }

   // --------------------------------- SIZE ------------------------------- //

   /**
    * Get the current queue sizes
    */
   public static async sizeGet(parsed: ParsedCommand | ParsedMessage) {
      await parsed.readArgs({ commandNameLength: 8 });

      let response = "**Sizes**:\n";
      for await (const storedQueueChannel of await parsed.getStoredQueueChannels()) {
         const queueChannel = (await parsed.request.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         if (!queueChannel) continue;
         response += `\`${queueChannel.name}\`: ${storedQueueChannel.max_members || "none"}\n`;
      }
      await parsed
         .reply({
            content: response,
         })
         .catch(() => null);
   }

   /**
    * Set the size of a queue
    */
   public static async sizeSet(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({
         commandNameLength: 8,
         hasChannel: true,
         hasNumber: true,
         numberArgs: { min: 1, max: 99, defaultValue: null },
      });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;
      let max = parsed.args.num;

      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
      await QueueChannelTable.updateMaxMembers(queueChannel.id, max);
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
                     "If that does'nt work, check the channel-specific permissions.",
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
   public static async start(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 5, hasChannel: true, channelType: ["GUILD_VOICE", "GUILD_STAGE_VOICE"] });

      const queueChannel = parsed.args.channel as VoiceChannel | StageChannel;
      if (!queueChannel?.id) return;

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

   // --------------------------------- UPDATE ------------------------------- //

   /**
    * Force a queue to update
    */
   public static async update(parsed: ParsedCommand | ParsedMessage): Promise<void> {
      await parsed.readArgs({ commandNameLength: 6, hasChannel: true });

      const queueChannel = parsed.args.channel;
      if (!queueChannel?.id) return;

      const storedQueueChannel = parsed.queueChannels.find((ch) => ch.queue_channel_id === queueChannel.id);
      if (!storedQueueChannel.role_id) {
         await parsed
            .reply({
               content: `Attempting to create role for \`${queueChannel.name}\`.`,
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
         const role = await QueueChannelTable.createQueueRole(parsed, queueChannel, storedQueueChannel.color);
         if (role) {
            await QueueChannelTable.updateRoleId(queueChannel, role);
         }
      }

      await parsed
         .reply({
            content: `Verifying users in \`${queueChannel.name}\`. This may take a while...`,
            commandDisplay: "EPHEMERAL",
         })
         .catch(() => null);
      const queueMembers = await QueueMemberTable.getFromQueue(queueChannel);
      for await (const queueMember of queueMembers) {
         await QueueMemberTable.getMemberFromQueueMember(queueChannel, queueMember);
      }
      await parsed
         .reply({
            content: `Done updating.`,
            commandDisplay: "EPHEMERAL",
         })
         .catch(() => null);
      SchedulingUtils.scheduleDisplayUpdate(parsed.queueGuild, queueChannel);
   }
}
