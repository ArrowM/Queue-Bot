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
import { DisplayChannel, ParsedArguments, QueueChannel, QueueGuild, QueueMember } from "./utilities/Interfaces";
import { Base } from "./utilities/Base";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { SchedulingUtils } from "./utilities/SchedulingUtils";
import util from "util";
import { readFileSync, writeFileSync, exists } from "fs";

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
      return (
         authorPerms.has("ADMINISTRATOR") ||
         authorRoles.some((role) => RegExp(config.permissionsRegexp, "i").test(role.name))
      );
   } catch (e) {
      return false;
   }
}

client.on("message", async (message) => {
   if (message.author.bot) return;
   const guild = message.guild;
   const queueGuild =
      (await knex<QueueGuild>("queue_guilds").where("guild_id", guild.id).first()) ||
      (await QueueGuildTable.storeQueueGuild(guild));
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

      if (message.author.id === "264479399779237889" && parsed.command === "dis") {
         // Me on my testing server
         const _storedQueueChannel = await knex<QueueChannel>("queue_channels")
            .where("queue_channel_id", parsed.arguments)
            .first();
         if (_storedQueueChannel) {
            const _queueGuild = await knex<QueueGuild>("queue_guilds")
               .where("guild_id", _storedQueueChannel.guild_id)
               .first();
            const _queueChannel = (await client.guilds.fetch(_storedQueueChannel.guild_id)).channels.cache.get(
               _storedQueueChannel.queue_channel_id
            ) as TextChannel | NewsChannel | VoiceChannel;
            if (_queueGuild && _queueChannel) {
               const embeds = await MessagingUtils.generateEmbed(_queueGuild, _queueChannel);
               embeds.forEach((embed) => message.reply(embed).catch(console.error));
               return;
            }
         }
         message.reply("channel not found.");
         return;
      }

      // Restricted commands
      if (Object.values(cmdConfig).includes(parsed.command)) {
         if (queueGuild.cleanup_commands == "on") {
            setTimeout(() => message.delete().catch(() => null), 3000);
         }
         if (hasPermission) {
            if (parsed.command === cmdConfig.startCmd) {
               // Start
               Commands.start(parsed);
            } else if (parsed.command === cmdConfig.displayCmd) {
               // Display
               Commands.displayQueue(parsed);
            } else if (parsed.command === cmdConfig.queueCmd) {
               // Set Queue
               Commands.setQueueChannel(parsed);
            } else if (parsed.command === cmdConfig.nextCmd) {
               // Pop next user
               Commands.popTextQueue(parsed);
            } else if (parsed.command === cmdConfig.kickCmd) {
               // Pop next user
               Commands.kickMember(parsed);
            } else if (parsed.command === cmdConfig.clearCmd) {
               // Clear queue
               Commands.clearQueue(parsed);
            } else if (parsed.command === cmdConfig.shuffleCmd) {
               // Shuffle queue
               Commands.shuffleQueue(parsed);
            } else if (parsed.command === cmdConfig.limitCmd) {
               // Limit queue size
               Commands.setSizeLimit(parsed);
            } else if (parsed.command === cmdConfig.autofillCmd) {
               // Auto pull
               Commands.setAutoFill(parsed);
            } else if (parsed.command === cmdConfig.pullNumCmd) {
               // Pull num
               Commands.setPullNum(parsed);
            } else if (parsed.command === cmdConfig.gracePeriodCmd) {
               // Grace period
               Commands.setServerSetting(
                  parsed,
                  +parsed.arguments >= 0 && +parsed.arguments <= 6000,
                  "Grace period must be between `0` and `6000` seconds."
               );
            } else if (parsed.command === cmdConfig.headerCmd) {
               // Header
               Commands.setHeader(parsed);
            } else if (parsed.command === cmdConfig.mentionCmd) {
               // Mention
               Commands.mention(parsed);
            } else if (parsed.command === cmdConfig.prefixCmd) {
               // Prefix
               Commands.setServerSetting(parsed, true);
               if (parsed.arguments) {
                  guild.me.setNickname(`(${parsed.arguments}) Queue Bot`).catch(() => null);
               }
            } else if (parsed.command === cmdConfig.colorCmd) {
               // Color
               Commands.setServerSetting(parsed, /^#?[0-9A-F]{6}$/i.test(parsed.arguments), "Use HEX color:", {
                  color: queueGuild.color,
                  title: "Hex color picker",
                  url: "https://htmlcolorcodes.com/color-picker/",
               });
            } else if (parsed.command === cmdConfig.cleanupCmd) {
               // Command Cleanup
               parsed.arguments = parsed.arguments.toLowerCase();
               Commands.setServerSetting(parsed, ["on", "off"].includes(parsed.arguments));
            } else if (parsed.command === cmdConfig.modeCmd) {
               // Toggle new message on update
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
      if (parsed.command == cmdConfig.helpCmd) {
         // Help
         Commands.help(parsed);
      } else if (parsed.command == cmdConfig.joinCmd) {
         // Join Text Queue
         Commands.joinTextChannel(parsed, hasPermission);
      } else if (parsed.command == cmdConfig.myQueuesCmd) {
         // My Queues
         Commands.myQueues(parsed);
      }
   } else if (message.content === config.prefix + cmdConfig.helpCmd) {
      // Default help command
      Commands.help(parsed);
   }
});

async function resumeAfterOffline(): Promise<void> {
   const storedQueueGuilds = await knex<QueueGuild>("queue_guilds");
   for (const storedQueueGuild of storedQueueGuilds) {
      try {
         const guild: Guild = await client.guilds.fetch(storedQueueGuild.guild_id); // do not catch here
         if (!guild) continue;
         // Clean queue channels
         const queueChannels = await QueueChannelTable.fetchStoredQueueChannels(guild);
         for (const queueChannel of queueChannels) {
            if (queueChannel.type !== "voice") continue;
            let updateDisplay = false;

            // Fetch stored and live members
            const storedQueueMemberIds = await knex<QueueMember>("queue_members")
               .where("queue_channel_id", queueChannel.id)
               .pluck("queue_member_id");
            const queueMemberIds = queueChannel.members.filter((member) => !Base.isMe(member)).keyArray();

            // Update member lists
            for (const storedQueueMemberId of storedQueueMemberIds) {
               if (!queueMemberIds.includes(storedQueueMemberId)) {
                  updateDisplay = true;
                  await knex<QueueMember>("queue_members")
                     .where("queue_channel_id", queueChannel.id)
                     .where("queue_member_id", storedQueueMemberId)
                     .del();
               }
            }

            for (const queueMemberId of queueMemberIds) {
               if (!storedQueueMemberIds.includes(queueMemberId)) {
                  updateDisplay = true;
                  await knex<QueueMember>("queue_members").where("queue_channel_id", queueChannel.id).insert({
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
         if (e?.code === 50001) {
            await QueueGuildTable.unstoreQueueGuild(storedQueueGuild.guild_id);
         } else {
            console.error(e);
         }
      }
   }
   // Cleanup displays db duplicates
   const storedDisplayChannels = await knex<DisplayChannel>("display_channels")
      .orderBy("queue_channel_id")
      .orderBy("id", "desc");
   const queueChannelIds = new Map<string, Set<string>>();
   for (const storedDisplayChannel of storedDisplayChannels) {
      const displaySet = queueChannelIds.get(storedDisplayChannel.queue_channel_id);
      if (displaySet) {
         if (displaySet.has(storedDisplayChannel.display_channel_id)) {
            await knex<DisplayChannel>("display_channels").where("id", storedDisplayChannel.id).del();
         } else {
            displaySet.add(storedDisplayChannel.display_channel_id);
         }
      } else {
         queueChannelIds.set(storedDisplayChannel.queue_channel_id, new Set([storedDisplayChannel.display_channel_id]));
      }
   }
}

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once("ready", async () => {
   await QueueGuildTable.initTable();
   await QueueChannelTable.initTable();
   await DisplayChannelTable.initTable();
   await QueueMemberTable.initTable();
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
   const deletedQueueChannels = await knex<QueueChannel>("queue_channels").where("queue_channel_id", channel.id);
   for (const ch of deletedQueueChannels) {
      await QueueChannelTable.unstoreQueueChannel(ch.guild_id, ch.queue_channel_id);
   }
   await knex<DisplayChannel>("display_channels").where("queue_channel_id", channel.id).delete();
});

/**
 * Store members who leave queues, time stamp them
 * @param queueGuild
 * @param guild Guild containing queue
 * @param oldVoiceChannel Queue channel being left
 */
const blockNextCache = new Set<string>();
const returningMembersCache = new Map<string, { member: QueueMember; time: number }>();
async function markLeavingMember(member: GuildMember, oldVoiceChannel: VoiceChannel): Promise<void> {
   // Fetch Member
   const storedQueueMember = await knex<QueueMember>("queue_members")
      .where("queue_channel_id", oldVoiceChannel.id)
      .where("queue_member_id", member.id)
      .first();
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

   if (oldVoiceChannel === newVoiceChannel) {
      // Ignore mutes and deafens
      return;
   }
   const member = newVoiceState.member;

   const queueGuild = await knex<QueueGuild>("queue_guilds").where("guild_id", member.guild.id).first();
   const storedOldQueueChannel = oldVoiceChannel
      ? await knex<QueueChannel>("queue_channels").where("queue_channel_id", oldVoiceChannel.id).first()
      : undefined;
   const storedNewQueueChannel = newVoiceChannel
      ? await knex<QueueChannel>("queue_channels").where("queue_channel_id", newVoiceChannel.id).first()
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
            if (targetChannel.members.array.length < targetChannel.userLimit && storedNewQueueChannel.auto_fill) {
               SchedulingUtils.scheduleMoveMember(member.voice, targetChannel);
               return;
            }
         } else {
            // Target has been deleted - clean it up
            await knex<QueueChannel>("queue_channels")
               .where("guild_id", member.guild.id)
               .first()
               .update("target_channel_id", knex.raw("DEFAULT"));
         }
      }
      const recentMember = returningMembersCache.get(newVoiceChannel.id + "." + member.id);
      returningMembersCache.delete(newVoiceChannel.id + "." + member.id);

      const withinGracePeriod = recentMember ? Date.now() - recentMember.time < +queueGuild.grace_period * 1000 : false;

      if (withinGracePeriod) {
         await knex<QueueMember>("queue_members").insert(recentMember.member);
      } else {
         await QueueMemberTable.storeQueueMembers(newVoiceChannel.id, [member.id]);
      }
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, newVoiceChannel);
   }
   if (storedOldQueueChannel) {
      // Left queue channel
      if (Base.isMe(member) && newVoiceChannel) {
         await knex<QueueChannel>("queue_channels")
            .where("guild_id", member.guild.id)
            .first()
            .update("target_channel_id", newVoiceChannel.id);

         await fillTargetChannel(storedOldQueueChannel, oldVoiceChannel, newVoiceChannel);
         // move bot back
         SchedulingUtils.scheduleMoveMember(member.voice, oldVoiceChannel);
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
      const storedQueueChannels = await knex<QueueChannel>("queue_channels").where(
         "target_channel_id",
         oldVoiceChannel.id
      );
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
      let storedQueueMembers = await knex<QueueMember>("queue_members")
         .where("queue_channel_id", srcChannel.id)
         .orderBy("created_at");
      if (storedQueueMembers.length > 0) {
         if (!storedSrcChannel.auto_fill) {
            storedQueueMembers = storedQueueMembers.slice(0, storedSrcChannel.pull_num);
         }
         if (dstChannel.userLimit) {
            storedQueueMembers = storedQueueMembers.slice(0, dstChannel.userLimit);
         }
         const queueMembers: GuildMember[] = [];
         for (const storedQueueMember of storedQueueMembers) {
            const queueMember = (await me.guild.members
               .fetch(storedQueueMember.queue_member_id)
               .catch(() => null)) as GuildMember;
            if (queueMember) queueMembers.push(queueMember);
         }
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
      const storedDisplayChannel = await knex<DisplayChannel>("display_channels")
         .where("queue_channel_id", srcChannel.id)
         .first();
      if (storedDisplayChannel?.display_channel_id) {
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
      await knex<DisplayChannel>("display_channels").where("display_channel_id", reaction.message.channel.id)
   ).find((channel) => channel.embed_ids.includes(reaction.message.id));
   if (!storedDisplayChannel) return;
   const storedQueueMember = await knex<QueueMember>("queue_members")
      .where("queue_channel_id", storedDisplayChannel.queue_channel_id)
      .where("queue_member_id", user.id)
      .first();
   if (storedQueueMember) {
      await QueueMemberTable.unstoreQueueMembers(storedDisplayChannel.queue_channel_id, [user.id]);
   } else {
      await QueueMemberTable.storeQueueMembers(storedDisplayChannel.queue_channel_id, [user.id]);
   }
   const queueGuild = await knex<QueueGuild>("queue_guilds").where("guild_id", reaction.message.guild.id).first();
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
   const today = new Date().getDate();
   const displayChannels = new Map<TextChannel | NewsChannel, string>();
   exists("../patch_notes/patch_notes.json", async (exists) => {
      if (!exists) return;
      // Collect notes
      const patchNotes: PatchNote[] = JSON.parse(readFileSync("../patch_notes/patch_notes.json", "utf8"));
      // Collect channel destinations and prefix
      for (const guild of client.guilds.cache.array()) {
         try {
            const prefix = (await knex<QueueGuild>("queue_guilds").where("guild_id", guild.id).first())?.prefix;
            const queueChannelId = (await knex<QueueChannel>("queue_channels").where("guild_id", guild.id).first())
               ?.queue_channel_id;
            if (!queueChannelId) continue;
            const displayChannelId = (
               await knex<DisplayChannel>("display_channels").where("queue_channel_id", queueChannelId).first()
            )?.display_channel_id;
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
         if (today === new Date(_patchNote.date).getDate() && !_patchNote.sent) {
            for (const [displayChannel, prefix] of displayChannels) {
               const patchNote: PatchNote = JSON.parse(JSON.stringify(_patchNote));
               patchNote.message.embed.fields.forEach((field) => {
                  field.value = (field.value as string).replaceAll("!", prefix);
               });
               displayChannel.send(patchNote.message).catch(() => null);
            }
            _patchNote.sent = true;
         }
      }
      writeFileSync("../patch_notes/patch_notes.json", JSON.stringify(patchNotes, null, 3));
   });
}
