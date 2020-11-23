import DBL from "dblapi.js";
import { Guild, GuildMember, Message, TextChannel, VoiceChannel } from "discord.js";
import { EventEmitter } from "events";
import { Commands } from "./Commands";
import { DisplayChannel, ParsedArguments, QueueChannel, QueueGuild, QueueMember } from "./utilities/Interfaces";
import { Base } from "./utilities/Base";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { MutexUtils } from "./utilities/MutexUtils";
import { MutexInterface } from "async-mutex";
import { MessageUtils } from "./utilities/MessageUtils";
import util from "util";

// Setup client
EventEmitter.defaultMaxListeners = 0; // Maximum number of events that can be handled at once.
QueueGuildTable.initTable();
QueueChannelTable.initTable();
DisplayChannelTable.initTable();
QueueMemberTable.initTable();
MessageUtils.startScheduler();

const config = Base.getConfig();
const client = Base.getClient();
const knex = Base.getKnex();
client.login(config.token);
client.on("error", console.error);
client.on("shardError", console.error);
client.on("rateLimit", (rateLimitInfo) => {
   console.error(`Rate limit error:\n${util.inspect(rateLimitInfo, { depth: null })}`);
});
client.on("uncaughtException", (err, origin) => {
   console.error(`Caught exception:\n${util.inspect(err, { depth: null })}\nException origin:\n${util.inspect(origin, { depth: null })}`);
});

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
   const regex = RegExp(config.permissionsRegexp, "i");
   return message.member.roles.cache.some((role) => regex.test(role.name)) || message.member.id === message.guild.ownerID;
}

function setNickname(guild: Guild, prefix: string): void {
   guild.me.setNickname(`(${prefix}) Queue Bot`).catch(() => null);
}

async function createDefaultGuild(guild: Guild): Promise<QueueGuild> {
   await knex<QueueGuild>("queue_guilds")
      .insert({
         color: "#51ff7e",
         grace_period: "0",
         guild_id: guild.id,
         msg_mode: 1,
         prefix: config.prefix,
      })
      .catch(() => null);
   setNickname(guild, config.prefix);
   return await knex<QueueGuild>("queue_guilds").where("guild_id", guild.id).first();
}

client.on("message", async (message) => {
   if (message.author.bot) {
      return;
   }
   const guild = message.guild;
   const queueGuild = (await knex<QueueGuild>("queue_guilds").where("guild_id", guild.id).first()) || (await createDefaultGuild(guild));

   const parsed: ParsedArguments = { command: null, arguments: null };
   if (message.content.startsWith(queueGuild.prefix)) {
      // Parse the message
      // Note: prefix can contain spaces. Command can not contains spaces. parsedArgs can contain spaces.
      parsed.command = message.content.substring(queueGuild.prefix.length).split(" ")[0];
      parsed.arguments = message.content.substring(queueGuild.prefix.length + parsed.command.length + 1).trim();
      const hasPermission = checkPermission(message);
      // Restricted commands
      if (hasPermission) {
         switch (parsed.command) {
            // Start
            case config.startCmd:
               Commands.start(queueGuild, parsed, message);
               break;
            // Display
            case config.displayCmd:
               Commands.displayQueue(queueGuild, parsed, message);
               break;
            // Set Queue
            case config.queueCmd:
               Commands.setQueueChannel(queueGuild, parsed, message);
               break;
            // Pop next user
            case config.nextCmd:
               Commands.popTextQueue(queueGuild, parsed, message);
               break;
            // Pop next user
            case config.kickCmd:
               Commands.kickMember(queueGuild, parsed, message);
               break;
            // Clear queue
            case config.clearCmd:
               Commands.clearQueue(queueGuild, parsed, message);
               break;
            // Shuffle queue
            case config.shuffleCmd:
               Commands.shuffleQueue(queueGuild, parsed, message);
               break;

            // Grace period
            case config.gracePeriodCmd:
               Commands.setServerSetting(
                  queueGuild,
                  parsed,
                  message,
                  +parsed.arguments >= 0 && +parsed.arguments <= 6000,
                  "Grace period must be between `0` and `6000` seconds."
               );
               break;
            // Prefix
            case config.prefixCmd:
               Commands.setServerSetting(queueGuild, parsed, message, true);
               setNickname(guild, parsed.arguments);
               break;
            // Color
            case config.colorCmd:
               Commands.setServerSetting(queueGuild, parsed, message, /^#?[0-9A-F]{6}$/i.test(parsed.arguments), "Use HEX color:", {
                  color: +queueGuild.color,
                  title: "Hex color picker",
                  url: "https://htmlcolorcodes.com/color-picker/",
               });
               break;
            // Toggle New message on update
            case config.modeCmd:
               Commands.setServerSetting(
                  queueGuild,
                  parsed,
                  message,
                  +parsed.arguments >= 1 && +parsed.arguments <= 3,
                  "When the queue changes: \n" +
                     "`1`: (default) Update old display message \n" +
                     "`2`: Send a new display message and delete the old one. \n" +
                     "`3`: Send a new display message."
               );
               break;
         }
      } else if (
         [
            config.startCmd,
            config.displayCmd,
            config.queueCmd,
            config.nextCmd,
            config.kickCmd,
            config.clearCmd,
            config.gracePeriodCmd,
            config.prefixCmd,
            config.colorCmd,
         ].includes(parsed.command)
      ) {
         message.author
            .send(
               `You don't have permission to use bot commands in \`${message.guild.name}\`.` +
                  `You must be assigned a \`queue mod\`, \`mod\`, or \`admin\` role on the server to use bot Commands.`
            )
            .catch(() => null);
      }
      // Commands open to everyone
      switch (parsed.command) {
         // Help
         case config.helpCmd:
            Commands.help(queueGuild, parsed, message);
            break;
         // Join Text Queue
         case config.joinCmd:
            Commands.joinTextChannel(queueGuild, parsed, message, hasPermission);
            break;
      }
   } else if (message.content === config.prefix + config.helpCmd) {
      // Default help command
      Commands.help(queueGuild, parsed, message);
   }
});

async function resumeAfterOffline(): Promise<void> {
   const storedQueueGuilds = await knex<QueueGuild>("queue_guilds");
   for (const storedQueueGuild of storedQueueGuilds) {
      try {
         const guild: Guild = await client.guilds.fetch(storedQueueGuild.guild_id).catch(() => null);
         if (!guild) continue;
         // Clean queue channels
         const storedQueueChannels = await knex<QueueChannel>("queue_channels").where("guild_id", guild.id);
         for (const storedQueueChannel of storedQueueChannels) {
            const queueChannel = guild.channels.cache.get(storedQueueChannel.queue_channel_id) as TextChannel | VoiceChannel;
            if (queueChannel) {
               if (queueChannel.type !== "voice") continue;
               let updateDisplay = false;

               // Fetch stored and live members
               const storedQueueMemberIds = await knex<QueueMember>("queue_members")
                  .where("queue_channel_id", queueChannel.id)
                  .pluck("queue_member_id");
               const queueMemberIds = queueChannel.members.filter((member) => !member.user.bot).keyArray();

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
                  await MessageUtils.scheduleDisplayUpdate(storedQueueGuild, queueChannel);
               }
            } else {
               // Cleanup deleted queue channels
               await QueueChannelTable.unstoreQueueChannel(guild.id, storedQueueChannel.queue_channel_id);
            }
         }
      } catch (e) {
         if (e?.code === 50001) {
            // Cleanup deleted guilds
            await QueueChannelTable.unstoreQueueChannel(storedQueueGuild.guild_id);
            knex<QueueGuild>("queue_guilds").where("guild_id", storedQueueGuild.guild_id).del();
         } else {
            console.error(e);
         }
      }
   }
   // Cleanup displays db duplicates
   const storedDisplayChannels = await knex<DisplayChannel>("display_channels").orderBy("queue_channel_id").orderBy("id", "desc");
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
   await resumeAfterOffline();
   console.log("Ready!");
});

client.on("shardResume", async () => {
   await resumeAfterOffline();
   console.log("Reconnected!");
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

   if (oldVoiceChannel !== newVoiceChannel) {
      const member = newVoiceState.member;
      const guild = newVoiceState.guild;

      const queueGuild = await knex<QueueGuild>("queue_guilds").where("guild_id", guild.id).first();
      const storedOldQueueChannel = oldVoiceChannel
         ? await knex<QueueChannel>("queue_channels").where("queue_channel_id", oldVoiceChannel.id).first()
         : undefined;
      const storedNewQueueChannel = newVoiceChannel
         ? await knex<QueueChannel>("queue_channels").where("queue_channel_id", newVoiceChannel.id).first()
         : undefined;

      if (storedOldQueueChannel && storedNewQueueChannel && member.user.bot) {
         return;
      }
      let memberReleases: MutexInterface.Releaser[] = [];
      try {
         if (storedNewQueueChannel && !member.user.bot) {
            memberReleases.push(await MutexUtils.getMemberLock(storedNewQueueChannel.queue_channel_id).acquire());
            // Joined queue channel
            // Check for existing, don't duplicate member entries
            const recentMember = returningMembersCache.get(newVoiceChannel.id + "." + member.id);
            returningMembersCache.delete(newVoiceChannel.id + "." + member.id);

            const withinGracePeriod = recentMember ? Date.now() - recentMember.time < +queueGuild.grace_period * 1000 : false;

            if (withinGracePeriod) {
               await knex<QueueMember>("queue_members").insert(recentMember.member);
            } else {
               await QueueMemberTable.storeQueueMembers(newVoiceChannel.id, [member.id]);
            }
            MessageUtils.scheduleDisplayUpdate(queueGuild, newVoiceChannel);
         }
         if (storedOldQueueChannel) {
            memberReleases.push(await MutexUtils.getMemberLock(storedOldQueueChannel.queue_channel_id).acquire());
            // Left queue channel
            if (member.user.bot && newVoiceChannel) {
               // Pop the nextQueueMember off the stored queue
               const nextStoredQueueMember = await knex<QueueMember>("queue_members")
                  .where("queue_channel_id", oldVoiceChannel.id)
                  .orderBy("created_at")
                  .first();
               if (nextStoredQueueMember) {
                  const nextQueueMember: GuildMember = await guild.members.fetch(nextStoredQueueMember.queue_member_id).catch(() => null);
                  // Block recentMember caching when the bot is used to pull someone
                  if (nextQueueMember) {
                     blockNextCache.add(nextQueueMember.id);
                     // Swap bot with nextQueueMember
                     nextQueueMember.voice.setChannel(newVoiceChannel).catch(() => null);
                     member.voice.setChannel(oldVoiceChannel).catch(() => null);
                  }
               }
            } else {
               if (blockNextCache.delete(member.id)) {
                  // Getting pulled using bot, do not cache
                  await QueueMemberTable.unstoreQueueMembers(oldVoiceChannel.id, [member.id]);
               } else {
                  // Otherwise, cache it
                  await markLeavingMember(member, oldVoiceChannel);
               }
            }
            MessageUtils.scheduleDisplayUpdate(queueGuild, oldVoiceChannel);
         }
      } finally {
         memberReleases.forEach((release) => release());
      }
   }
});
