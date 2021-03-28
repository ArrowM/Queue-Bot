import DBL from "dblapi.js";
import {
   Guild,
   GuildMember,
   Message,
   MessageOptions,
   MessageReaction,
   NewsChannel,
   PartialUser,
   TextChannel,
   User,
   VoiceChannel,
} from "discord.js";
import { EventEmitter } from "events";
import { Commands } from "./Commands";
import { ParsedArguments, QueueChannel, QueueMember } from "./utilities/Interfaces";
import { Base } from "./utilities/Base";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { SchedulingUtils } from "./utilities/SchedulingUtils";
import util from "util";
import { readFileSync, writeFileSync, exists } from "fs";
import { MemberPermsTable } from "./utilities/tables/MemberPermsTable";

// Setup client
EventEmitter.defaultMaxListeners = 0; // Maximum number of events that can be handled at once.
SchedulingUtils.startScheduler();

const config = Base.getConfig();
const cmdConfig = Base.getCmdConfig();
const client = Base.getClient();
const knex = Base.getKnex();
client.login(config.token);
client.on("error", console.error);
client.on("shardError", console.error);
client.on("uncaughtException", (err, origin) => {
   console.error(
      `Caught exception:\n${util.inspect(err, { depth: null })}\nException origin:\n${util.inspect(origin, {
         depth: null,
      })}`
   );
});
//client.on("rateLimit", (rateLimitInfo) => {
//   console.error(`Rate limit error:\n${util.inspect(rateLimitInfo, { depth: null })}`);
//});

// Top GG integration
if (config.topGgToken) {
   const dbl = new DBL(config.topGgToken, client);
   dbl.on("error", () => null);
}

/**
 * Determine whether user has permission to interact with bot
 * @param message Discord message object.
 */
function checkPermission(message: Message): boolean {
   try {
      const channel = message.channel as TextChannel | NewsChannel;
      const authorPerms = channel.permissionsFor(message.author);
      const authorRoles = message.member.roles.cache;
      return authorPerms.has("ADMINISTRATOR") || authorRoles.some((role) => RegExp(config.permissionsRegexp, "i").test(role.name));
   } catch (e) {
      return false;
   }
}

const EVERYONE_COMMANDS = [cmdConfig.joinCmd, cmdConfig.helpCmd, cmdConfig.myQueuesCmd];
client.on("message", async (message) => {
   if (message.author.bot) return;
   const guild = message.guild;
   let queueGuild = await QueueGuildTable.get(guild.id);
   if (!queueGuild) {
      await QueueGuildTable.storeQueueGuild(message.guild);
      queueGuild = await QueueGuildTable.get(guild.id);
   }

   const parsed: ParsedArguments = {
      queueGuild: queueGuild,
      message: message,
      command: null,
      arguments: null,
   };
   if (message.content.startsWith(queueGuild.prefix)) {
      // Parse the message
      // Note: prefix can contain spaces. Command can not contains spaces. parsedArgs can contain spaces.
      parsed.command = message.content.substring(queueGuild.prefix.length).split(" ")[0];
      parsed.arguments = message.content.substring(queueGuild.prefix.length + parsed.command.length + 1).trim();
      const hasPermission = checkPermission(message);

      // Restricted commands
      if (Object.values(cmdConfig).includes(parsed.command) && !EVERYONE_COMMANDS.includes(parsed.command)) {
         if (queueGuild.cleanup_commands == "on") {
            setTimeout(() => message.delete().catch(() => null), 3000);
         }
         if (hasPermission) {
            /* eslint-disable prettier/prettier */
            if (parsed.command === cmdConfig.startCmd) {
               Commands.start(parsed);
// Display
            } else if (parsed.command === cmdConfig.displayCmd) {
               Commands.displayQueue(parsed);
// Set Queue
            } else if (parsed.command === cmdConfig.queueCmd) {
               Commands.setQueue(parsed);
// Queue Delete
            } else if (parsed.command === cmdConfig.queueDeleteCmd) {
               Commands.queueDelete(parsed);
// Pop next user
            } else if (parsed.command === cmdConfig.nextCmd) {
               Commands.next(parsed);
// Pop next user
            } else if (parsed.command === cmdConfig.kickCmd) {
               Commands.kickMember(parsed);
// Clear queue
            } else if (parsed.command === cmdConfig.clearCmd) {
               Commands.clearQueue(parsed);
// Shuffle queue
            } else if (parsed.command === cmdConfig.shuffleCmd) {
               Commands.shuffleQueue(parsed);
// Limit queue size
            } else if (parsed.command === cmdConfig.limitCmd) {
               Commands.setSizeLimit(parsed);
// Auto pull
            } else if (parsed.command === cmdConfig.autofillCmd) {
               Commands.setAutoFill(parsed);
// Pull num
            } else if (parsed.command === cmdConfig.pullNumCmd) {
               Commands.setPullNum(parsed);
// Grace period
            } else if (parsed.command === cmdConfig.gracePeriodCmd) {
               Commands.setServerSetting(
                  parsed,
                  +parsed.arguments >= 0 && +parsed.arguments <= 6000,
                  "Grace period must be between `0` and `6000` seconds."
               );
// Header
            } else if (parsed.command === cmdConfig.headerCmd) {
               Commands.setHeader(parsed);
// Mention
            } else if (parsed.command === cmdConfig.mentionCmd) {
               Commands.mention(parsed);
//// Whitelist
//            } else if (parsed.command === cmdConfig.whitelistCmd) {
//               Commands.whitelist(parsed);
// Blacklist
            } else if (parsed.command === cmdConfig.blacklistCmd) {
               Commands.blacklist(parsed);
// Prefix
            } else if (parsed.command === cmdConfig.prefixCmd) {
               Commands.setServerSetting(parsed, true);
               if (parsed.arguments) {
                  guild.me.setNickname(`(${parsed.arguments}) Queue Bot`).catch(() => null);
               }
// Color
            } else if (parsed.command === cmdConfig.colorCmd) {
               Commands.setServerSetting(parsed, /^#?[0-9A-F]{6}$/i.test(parsed.arguments), "Use HEX color:", {
                  color: queueGuild.color,
                  title: "Hex color picker",
                  url: "https://htmlcolorcodes.com/color-picker/",
               });
// Command Cleanup
            } else if (parsed.command === cmdConfig.cleanupCmd) {
               parsed.arguments = parsed.arguments.toLowerCase();
               Commands.setServerSetting(parsed, ["on", "off"].includes(parsed.arguments));
// Toggle new message on update
            } else if (parsed.command === cmdConfig.modeCmd) {
               Commands.setServerSetting(
                  parsed,
                  +parsed.arguments >= 1 && +parsed.arguments <= 3,
                  "When the queue changes: \n" +
                     "`1`: (default) Update old display message \n" +
                     "`2`: Send a new display message and delete the old one. \n" +
                     "`3`: Send a new display message."
               );
            }
         } else {
            message.author
               .send(
                  `You don't have permission to use bot commands in \`${message.guild.name}\`.` +
                     `You must be assigned a \`queue mod\`, \`mod\`, or \`admin\` role on the server to use bot Commands.`
               )
               .catch(() => null);
         }
      }
      // Commands open to everyone
// Help
      if (parsed.command == cmdConfig.helpCmd) {
         Commands.help(parsed);
// Join Text Queue
      } else if (parsed.command == cmdConfig.joinCmd) {
         Commands.joinTextChannel(parsed, hasPermission);
// My Queues
      } else if (parsed.command == cmdConfig.myQueuesCmd) {
         Commands.myQueues(parsed);
      }
   }
});

async function resumeAfterOffline(): Promise<void> {
   const storedQueueGuilds = await QueueGuildTable.getAll();
   for (const storedQueueGuild of storedQueueGuilds) {
      try {
         const guild: Guild = await client.guilds.fetch(storedQueueGuild.guild_id); // do not catch here
         if (!guild) continue;
         // Clean queue channels
         const queueChannels = await QueueChannelTable.getFromGuild(guild);
         for (const queueChannel of queueChannels) {
            if (queueChannel.type !== "voice") continue;
            let updateDisplay = false;

            // Fetch stored and live members
            const storedQueueMemberIds = (await QueueMemberTable.getFromQueue(queueChannel)).map((member) => member.queue_member_id);
            const queueMemberIds = queueChannel.members.filter((member) => !Base.isMe(member)).keyArray();

            // Update member lists
            for (const storedQueueMemberId of storedQueueMemberIds) {
               if (!queueMemberIds.includes(storedQueueMemberId)) {
                  updateDisplay = true;
                  await QueueMemberTable.get(queueChannel.id, storedQueueMemberId).del();
               }
            }

            for (const queueMemberId of queueMemberIds) {
               if (!storedQueueMemberIds.includes(queueMemberId)) {
                  updateDisplay = true;
                  await knex<QueueMember>("queue_members").insert({
                     queue_channel_id: queueChannel.id,
                     queue_member_id: queueMemberId,
                  });
               }
            }
            if (updateDisplay) {
               // Update displays
               SchedulingUtils.scheduleDisplayUpdate(storedQueueGuild, queueChannel);
            }
         }
      } catch (e) {
         if (e.code == 50001 || e.httpStatus == 403) {
            await QueueGuildTable.unstoreQueueGuild(storedQueueGuild.guild_id);
         } else {
            console.error(e);
         }
      }
   }
   //// Cleanup displays db duplicates
   //const storedDisplayChannels = await knex<DisplayChannel>("display_channels")
   //   .orderBy("queue_channel_id")
   //   .orderBy("id", "desc");
   //const queueChannelIds = new Map<string, Set<string>>();
   //for (const storedDisplayChannel of storedDisplayChannels) {
   //   const displaySet = queueChannelIds.get(storedDisplayChannel.queue_channel_id);
   //   if (displaySet) {
   //      if (displaySet.has(storedDisplayChannel.display_channel_id)) {
   //         await knex<DisplayChannel>("display_channels").where("id", storedDisplayChannel.id).del();
   //      } else {
   //         displaySet.add(storedDisplayChannel.display_channel_id);
   //      }
   //   } else {
   //      queueChannelIds.set(storedDisplayChannel.queue_channel_id, new Set([storedDisplayChannel.display_channel_id]));
   //   }
   //}
}

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once("ready", async () => {
   await QueueGuildTable.initTable();
   await QueueChannelTable.initTable();
   await DisplayChannelTable.initTable();
   await QueueMemberTable.initTable();
   await MemberPermsTable.initTable();
   await resumeAfterOffline();
   checkPatchNotes();
   console.log("Ready!");
});

client.on("shardResume", async () => {
   await resumeAfterOffline();
   console.log("Reconnected!");
});

client.on("guildCreate", async (guild) => {
   await QueueGuildTable.storeQueueGuild(guild);
});

client.on("guildDelete", async (guild) => {
   await QueueGuildTable.unstoreQueueGuild(guild.id);
});

client.on("channelDelete", async (channel) => {
   const deletedQueueChannel = await QueueChannelTable.get(channel.id);
   if (deletedQueueChannel) {
      await QueueChannelTable.unstoreQueueChannel(deletedQueueChannel.guild_id, deletedQueueChannel.queue_channel_id);
   }
   await DisplayChannelTable.getFromQueue(channel.id).del();
});

/**
 * Store members who leave queues, time stamp them
 * @param member
 * @param oldVoiceChannel Queue channel being left
 */
const blockNextCache = new Set<string>();
const returningMembersCache = new Map<string, { member: QueueMember; time: number }>();
async function markLeavingMember(member: GuildMember, oldVoiceChannel: VoiceChannel): Promise<void> {
   // Fetch Member
   const storedQueueMember = await QueueMemberTable.get(oldVoiceChannel.id, member.id);
   await QueueMemberTable.unstoreQueueMembers(oldVoiceChannel.id, [member.id]);
   returningMembersCache.set(oldVoiceChannel.id + "." + member.id, {
      member: storedQueueMember,
      time: Date.now(),
   });
}

// Monitor for users joining voice channels
client.on("voiceStateUpdate", async (oldVoiceState, newVoiceState) => {
   const oldVoiceChannel = oldVoiceState?.channel;
   const newVoiceChannel = newVoiceState?.channel;

   const member = newVoiceState.member;
   if (
      oldVoiceChannel === newVoiceChannel ||
      (newVoiceChannel && await MemberPermsTable.isBlacklisted(newVoiceChannel.id, member.id))
   ) {
      // Ignore mutes and deafens
      return;
   }

   const queueGuild = await QueueGuildTable.get(member.guild.id);
   const storedOldQueueChannel = oldVoiceChannel
      ? await QueueChannelTable.get(oldVoiceChannel.id)
      : undefined;
   const storedNewQueueChannel = newVoiceChannel
      ? await QueueChannelTable.get(newVoiceChannel.id)
      : undefined;

   if (
      Base.isMe(member) &&
      ((storedOldQueueChannel && storedNewQueueChannel) || !oldVoiceChannel || !newVoiceChannel)
   ) {
      // Ignore when the bot moves between queues or when it starts and stops
      return;
   }
   if (storedNewQueueChannel && !Base.isMe(member)) {
      // Joined queue channel
      if (storedNewQueueChannel.target_channel_id) {
         const targetChannel = member.guild.channels.cache.get(storedNewQueueChannel.target_channel_id) as VoiceChannel;
         if (targetChannel) {
            if (
               storedNewQueueChannel.auto_fill &&
               newVoiceChannel.members.filter(member => !member.user.bot).size === 1 &&
               (!targetChannel.userLimit || targetChannel.members.filter(member => !member.user.bot).size < targetChannel.userLimit)
            ) {
               SchedulingUtils.scheduleMoveMember(member.voice, targetChannel);
               return;
            }
         } else {
            // Target has been deleted - clean it up
            await QueueChannelTable.updateTarget(newVoiceChannel.id, knex.raw("DEFAULT"));
         }
      }
      const returningMember = returningMembersCache.get(newVoiceChannel.id + "." + member.id);
      returningMembersCache.delete(newVoiceChannel.id + "." + member.id);

      const withinGracePeriod = returningMember ? Date.now() - returningMember.time < +queueGuild.grace_period * 1000 : false;

      if (withinGracePeriod && returningMember.member) {
         await knex<QueueMember>("queue_members").insert(returningMember.member);
      } else {
         await QueueMemberTable.storeQueueMembers(newVoiceChannel.id, [member.id]);
      }
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, newVoiceChannel);
   }
   if (storedOldQueueChannel) {
      // Left queue channel
      if (Base.isMe(member) && newVoiceChannel) {
         await QueueChannelTable.updateTarget(oldVoiceChannel.id, newVoiceChannel.id);
         // move bot back
         SchedulingUtils.scheduleMoveMember(member.voice, oldVoiceChannel);
         await setTimeout(async () => await fillTargetChannel(storedOldQueueChannel, oldVoiceChannel, newVoiceChannel), 1000);
      } else {
         if (blockNextCache.delete(member.id)) {
            // Getting pulled using bot, do not cache
            await QueueMemberTable.unstoreQueueMembers(oldVoiceChannel.id, [member.id]);
         } else {
            // Otherwise, cache it
            await markLeavingMember(member, oldVoiceChannel);
         }
      }
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, oldVoiceChannel);
   }
   if (!Base.isMe(member) && oldVoiceChannel) {
      // Check if leaving target channel
      const storedQueueChannels = await QueueChannelTable.getFromTarget(oldVoiceChannel.id);
      // Randomly pick a queue to pull from
      const storedQueueChannel = storedQueueChannels[~~(Math.random() * storedQueueChannels.length)];
      if (storedQueueChannel && storedQueueChannel.auto_fill) {
         const queueChannel = member.guild.channels.cache.get(storedQueueChannel.queue_channel_id) as VoiceChannel;
         if (queueChannel) {
            await fillTargetChannel(storedQueueChannel, queueChannel, oldVoiceChannel);
         }
      }
   }
});

export async function fillTargetChannel(
   storedSrcChannel: QueueChannel,
   srcChannel: VoiceChannel,
   dstChannel: VoiceChannel
): Promise<void> {
   const me = srcChannel.guild.me;
   // Check to see if I have perms to drag other users into this channel.
   if (dstChannel.permissionsFor(me).has("CONNECT")) {
      // Swap bot with nextQueueMember. If the destination has a user limit, swap with add enough users to fill the limit.
      let storedQueueMembers = await QueueMemberTable.getFromQueue(srcChannel, "created_at");
      if (storedQueueMembers.length > 0) {
         if (!storedSrcChannel.auto_fill) {
            storedQueueMembers = storedQueueMembers.slice(0, storedSrcChannel.pull_num);
         }
         if (dstChannel.userLimit) {
            storedQueueMembers = storedQueueMembers.slice(0, dstChannel.userLimit - dstChannel.members.filter(member => !member.user.bot).size);
         }
         const queueMembers = storedQueueMembers.map((member) => member.member);
         if (queueMembers.length > 0) {
            queueMembers.forEach((member) => {
               // Block recentMember caching when the bot is used to pull someone
               blockNextCache.add(member.id);
               SchedulingUtils.scheduleMoveMember(member.voice, dstChannel);
            });
         }
      }
   } else {
      // Request perms in display channel chat
      const storedDisplayChannel = await DisplayChannelTable.getFromQueue(srcChannel.id).first();
      if (storedDisplayChannel) {
         const displayChannel = me.guild.channels.cache.get(storedDisplayChannel.display_channel_id) as
            | TextChannel
            | NewsChannel;
         MessagingUtils.sendTempMessage(
            `I need the **CONNECT** permission in the \`${dstChannel.name}\` voice channel to pull in queue members.`,
            displayChannel,
            20
         );
      } else {
         me.guild.owner.send(
            `I need the **CONNECT** permission in the \`${dstChannel.name}\` voice channel to pull in queue members.`
         );
      }
   }
}

client.on("messageReactionAdd", async (reaction, user) => {
   await reactionToggle(reaction, user);
});

client.on("messageReactionRemove", async (reaction, user) => {
   await reactionToggle(reaction, user);
});

async function reactionToggle(reaction: MessageReaction, user: User | PartialUser): Promise<void> {
   if (reaction.partial) await reaction.fetch().catch(() => null);
   reaction = reaction.message.reactions.cache.find((r) => r.emoji.name === config.joinEmoji); // Handles a library bug
   if (!reaction || !reaction.me || user.bot) return;
   const storedDisplayChannel = (
      await DisplayChannelTable.get(reaction.message.channel.id)
   ).find((channel) => channel.embed_ids.includes(reaction.message.id));
   if (!storedDisplayChannel) return;
   const storedQueueMember = await QueueMemberTable.get(storedDisplayChannel.queue_channel_id, user.id);
   if (storedQueueMember) {
      await QueueMemberTable.unstoreQueueMembers(storedDisplayChannel.queue_channel_id, [user.id]);
   } else if (!(await MemberPermsTable.isBlacklisted(storedDisplayChannel.queue_channel_id, user.id))) {
      await QueueMemberTable.storeQueueMembers(storedDisplayChannel.queue_channel_id, [user.id]);
   }
   const queueGuild = await QueueGuildTable.get(reaction.message.guild.id);
   const queueChannel = reaction.message.guild.channels.cache.get(storedDisplayChannel.queue_channel_id) as
      | TextChannel
      | NewsChannel
      | VoiceChannel;
   SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
}

interface PatchNote {
   sent: boolean;
   date: Date;
   message: MessageOptions;
}

async function checkPatchNotes() {
   const displayChannels = new Map<TextChannel | NewsChannel, string>();
   exists("../patch_notes/patch_notes.json", async (exists) => {
      if (!exists) return;
      // Collect notes
      const patchNotes: PatchNote[] = JSON.parse(readFileSync("../patch_notes/patch_notes.json", "utf8"));
      // Collect channel destinations and prefix
      for (const guild of client.guilds.cache.array()) {
         try {
            const prefix = (await QueueGuildTable.get(guild.id))?.prefix;
            const queueChannelId = (await QueueChannelTable.getFromGuild(guild))[0]?.id;
            if (!queueChannelId) continue;
            const displayChannelId = (await DisplayChannelTable.get(queueChannelId).first())?.display_channel_id;
            if (!displayChannelId) continue;
            const displayChannel = guild.channels.cache.get(displayChannelId) as TextChannel | NewsChannel;
            if (!displayChannel) continue;
            displayChannels.set(displayChannel, prefix);
         } catch (e) {
            // Empty
         }
      }
      // Send notes
      for (const _patchNote of patchNotes) {
         if (!_patchNote.sent) {
            for (const [displayChannel, prefix] of displayChannels) {
               const patchNote: PatchNote = JSON.parse(JSON.stringify(_patchNote));
               patchNote.message.embed.fields.forEach((field) => {
                  field.value = (field.value as string).replaceAll(config.prefix, prefix);
               });
               displayChannel.send(patchNote.message).catch(() => null);
            }
            _patchNote.sent = true;
         }
      }
      writeFileSync("../patch_notes/patch_notes.json", JSON.stringify(patchNotes, null, 3));
   });
}
