import DBL from "dblapi.js";
import {
   ButtonInteraction,
   GuildMember,
   Interaction,
   PartialGuildMember,
   StageChannel,
   TextChannel,
   VoiceChannel,
} from "discord.js";
import { EventEmitter } from "events";
import { Commands } from "./Commands";
import { QueueChannel } from "./utilities/Interfaces";
import { Base } from "./utilities/Base";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { SchedulingUtils } from "./utilities/SchedulingUtils";
import util from "util";
import { BlackWhiteListTable } from "./utilities/tables/BlackWhiteListTable";
import { AdminPermissionTable } from "./utilities/tables/AdminPermissionTable";
import { ParsedCommand, ParsedMessage } from "./utilities/ParsingUtils";
import { PriorityTable } from "./utilities/tables/PriorityTable";
import { PatchingUtils } from "./utilities/PatchingUtils";
import { SlashCommands } from "./utilities/SlashCommands";

// Setup client
console.time("READY. Bot started in");
EventEmitter.defaultMaxListeners = 0; // Maximum number of events that can be handled at once.

let isReady = false;
const config = Base.config;
const client = Base.client;
const knex = Base.knex;
// noinspection JSIgnoredPromiseFromCall
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
// client.on("rateLimit", (rateLimitInfo) => {
//    console.error(`Rate limit error:\n${util.inspect(rateLimitInfo, { depth: null })}`);
// });

// Top GG integration
if (config.topGgToken) {
   const dbl = new DBL(config.topGgToken, client);
   dbl.on("error", () => null);
}

client.on("interactionCreate", async (interaction: Interaction) => {
   try {
      console.log("TEST");
      if (interaction.isButton()) {
         if (!isReady) return;
         if (!interaction.guild?.id) return;

         switch (interaction?.customId) {
            case "joinLeave":
               await joinLeaveButton(interaction);
               break;
         }
      } else if (interaction.isCommand()) {
         if (!isReady) {
            await interaction.reply("Bot is starting up. Please try again in 5 seconds...");
            return;
         }
         if (!interaction.guild?.id) {
            await interaction.reply("Commands can only be used in servers.");
            return;
         }

         const parsed = new ParsedCommand(interaction);
         await parsed.setup();
         await processCommand(parsed, [
            parsed.request.commandName,
            parsed.request.options?.data?.[0]?.name,
            parsed.request.options?.data?.[0]?.options?.[0]?.name,
         ]);
      }
   } catch (e) {
      console.error(e);
   }
});

async function checkPermission(parsed: ParsedCommand | ParsedMessage): Promise<boolean> {
   if (!parsed.hasPermission) {
      await parsed
         .reply({
            content: "ERROR: Missing permission to use that command",
            commandDisplay: "EPHEMERAL",
         })
         .catch(() => null);
      return false;
   }
   return true;
}

async function processCommand(parsed: ParsedCommand | ParsedMessage, command: string[]) {
   switch (command[0]) {
      case "help":
         switch (command[1]) {
            case undefined:
               await Commands.help(parsed);
               break;
            case "setup":
               await Commands.helpSetup(parsed);
               break;
            case "queues":
               await Commands.helpQueue(parsed);
               break;
            case "bot":
               await Commands.helpBot(parsed);
               break;
         }
         break;
      case "join":
         await Commands.join(parsed);
         break;
      case "leave":
         await Commands.leave(parsed);
         break;
      case "myqueues":
         await Commands.myqueues(parsed);
         break;
   }

   if (!(await checkPermission(parsed))) return;
   // -- ADMIN COMMANDS --
   switch (command[0]) {
      case "altprefix":
         await Commands.altPrefix(parsed);
         break;
      case "autopull":
         switch (command[1]) {
            case "get":
               await Commands.autopullGet(parsed);
               break;
            case "set":
               await Commands.autopullSet(parsed);
               break;
         }
         break;
      case "blacklist":
         switch (command[1]) {
            case "add":
               switch (command[2]) {
                  case "user":
                     await Commands.bwAdd(parsed, false, true);
                     break;
                  case "role":
                     await Commands.bwAdd(parsed, true, true);
                     break;
               }
               break;
            case "delete":
               switch (command[2]) {
                  case "user":
                     await Commands.bwDelete(parsed, false, true);
                     break;
                  case "role":
                     await Commands.bwDelete(parsed, true, true);
                     break;
               }
               break;
            case "list":
               await Commands.bwList(parsed, true);
               break;
            case "clear":
               await Commands.bwClear(parsed, true);
               break;
         }
         break;
      case "button":
         switch (command[1]) {
            case "get":
               await Commands.buttonGet(parsed);
               break;
            case "set":
               await Commands.buttonSet(parsed);
               break;
         }
         break;
      case "clear":
         await Commands.clear(parsed);
         break;
      case "color":
         switch (command[1]) {
            case "get":
               await Commands.colorGet(parsed);
               break;
            case "set":
               await Commands.colorSet(parsed);
               break;
         }
         break;
      case "display":
         await Commands.display(parsed);
         break;
      case "enqueue":
         switch (command[1]) {
            case "user":
               await Commands.enqueueUser(parsed);
               break;
            case "role":
               await Commands.enqueueRole(parsed);
               break;
         }
         break;
      case "graceperiod":
         switch (command[1]) {
            case "get":
               await Commands.graceperiodGet(parsed);
               break;
            case "set":
               await Commands.graceperiodSet(parsed);
               break;
         }
         break;
      case "header":
         switch (command[1]) {
            case "get":
               await Commands.headerGet(parsed);
               break;
            case "set":
               await Commands.headerSet(parsed);
               break;
         }
         break;
      case "kick":
         await Commands.kick(parsed);
         break;
      case "kickall":
         await Commands.kickAll(parsed);
         break;
      case "mentions":
         switch (command[1]) {
            case "get":
               await Commands.mentionsGet(parsed);
               break;
            case "set":
               await Commands.mentionsSet(parsed);
               break;
         }
         break;
      case "mode":
         switch (command[1]) {
            case "get":
               await Commands.modeGet(parsed);
               break;
            case "set":
               await Commands.modeSet(parsed);
               break;
         }
         break;
      case "next":
         await Commands.next(parsed);
         break;
      case "permission":
         switch (command[1]) {
            case "add":
               switch (command[2]) {
                  case "user":
                     await Commands.permissionAddUser(parsed);
                     break;
                  case "role":
                     await Commands.permissionAddRole(parsed);
                     break;
               }
               break;
            case "delete":
               switch (command[2]) {
                  case "user":
                     await Commands.permissionDeleteUser(parsed);
                     break;
                  case "role":
                     await Commands.permissionDeleteRole(parsed);
                     break;
               }
               break;
            case "list":
               await Commands.permissionList(parsed);
               break;
            case "clear":
               await Commands.permissionClear(parsed);
               break;
         }
         break;
      case "priority":
         switch (command[1]) {
            case "add":
               switch (command[2]) {
                  case "user":
                     await Commands.priorityAddUser(parsed);
                     break;
                  case "role":
                     await Commands.priorityAddRole(parsed);
                     break;
               }
               break;
            case "delete":
               switch (command[2]) {
                  case "user":
                     await Commands.priorityDeleteUser(parsed);
                     break;
                  case "role":
                     await Commands.priorityDeleteRole(parsed);
                     break;
               }
               break;
            case "list":
               await Commands.priorityList(parsed);
               break;
            case "clear":
               await Commands.priorityClear(parsed);
               break;
         }
         break;
      case "pullnum":
         switch (command[1]) {
            case "get":
               await Commands.pullnumGet(parsed);
               break;
            case "set":
               await Commands.pullnumSet(parsed);
               break;
         }
         break;
      case "queues":
         switch (command[1]) {
            case "add":
               await Commands.queuesAdd(parsed);
               break;
            case "delete":
               await Commands.queuesDelete(parsed);
               break;
            case "list":
               await Commands.queuesList(parsed);
               break;
         }
         break;
      case "shuffle":
         await Commands.shuffle(parsed);
         break;
      case "size":
         switch (command[1]) {
            case "get":
               await Commands.sizeGet(parsed);
               break;
            case "set":
               await Commands.sizeSet(parsed);
               break;
         }
         break;
      case "start":
         await Commands.start(parsed);
         break;
      case "whitelist":
         switch (command[1]) {
            case "add":
               switch (command[2]) {
                  case "user":
                     await Commands.bwAdd(parsed, false, false);
                     break;
                  case "role":
                     await Commands.bwAdd(parsed, true, false);
                     break;
               }
               break;
            case "delete":
               switch (command[2]) {
                  case "user":
                     await Commands.bwDelete(parsed, false, false);
                     break;
                  case "role":
                     await Commands.bwDelete(parsed, true, false);
                     break;
               }
               break;
            case "list":
               await Commands.bwList(parsed, false);
               break;
            case "clear":
               await Commands.bwClear(parsed, false);
               break;
         }
         break;
   }
}

client.on("messageCreate", async (message) => {
   try {
      const guildId = message.guild?.id;
      if (!(isReady && guildId && message.content[0] === "!")) return;
      // -
      const parsed = new ParsedMessage(message);
      await parsed.setup();
      if (parsed.queueGuild.enable_alt_prefix) {
         await processCommand(parsed, message.content.substring(1).split(" "));
      }
   } catch (e) {
      console.error(e);
   }
});

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once("ready", async () => {
   const guilds = Array.from(Base.client.guilds.cache.values());
   Base.shuffle(guilds);
   await PatchingUtils.run(guilds);
   await QueueGuildTable.initTable();
   await QueueChannelTable.initTable();
   await DisplayChannelTable.initTable();
   await QueueMemberTable.initTable();
   await BlackWhiteListTable.initTable();
   await AdminPermissionTable.initTable();
   await PriorityTable.initTable();
   SlashCommands.register(guilds).then();
   // Validator.validateAtStartup(guilds);
   SchedulingUtils.startScheduler();
   console.timeEnd("READY. Bot started in");
   isReady = true;
});

client.on("guildCreate", async (guild) => {
   if (!isReady) return;
   await QueueGuildTable.store(guild).catch(() => null);
});

client.on("roleUpdate", async (role) => {
   try {
      if (!isReady) return;
      const queueGuild = await QueueGuildTable.get(role.guild.id);
      const queueChannels = await QueueChannelTable.fetchFromGuild(role.guild);
      for await (const queueChannel of queueChannels) {
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      }
   } catch (e) {
      // Nothing
   }
});

client.on("roleDelete", async (role) => {
   try {
      if (!isReady) return;
      if (await PriorityTable.get(role.guild.id, role.id)) {
         await PriorityTable.unstore(role.guild.id, role.id);
         const queueGuild = await QueueGuildTable.get(role.guild.id);
         const queueChannels = await QueueChannelTable.fetchFromGuild(role.guild);
         for (const queueChannel of queueChannels) {
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
         }
      }
   } catch (e) {
      // Nothing
   }
});

async function memberUpdate(member: GuildMember | PartialGuildMember) {
   try {
      if (!isReady) return;
      const queueGuild = await QueueGuildTable.get(member.guild.id);
      const queueMembers = await QueueMemberTable.getFromMember(member.id);
      for await (const queueMember of queueMembers) {
         const queueChannel = (await member.guild.channels.fetch(queueMember.channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel
            | TextChannel;
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      }
   } catch (e) {
      // Nothing
   }
}

client.on("guildMemberUpdate", async (oldMember, newMember) => {
   await memberUpdate(newMember);
});

client.on("guildMemberRemove", async (guildMember) => {
   await memberUpdate(guildMember);
});

client.on("guildDelete", async (guild) => {
   if (!isReady) return;
   await QueueGuildTable.unstore(guild.id).catch(() => null);
});

client.on("channelDelete", async (channel) => {
   try {
      if (!isReady || channel.type === "DM") return;
      const deletedQueueChannel = await QueueChannelTable.get(channel.id);
      if (deletedQueueChannel) {
         await QueueChannelTable.unstore(deletedQueueChannel.guild_id, deletedQueueChannel.queue_channel_id);
      }
      await DisplayChannelTable.getFromQueue(channel.id).delete();
   } catch (e) {
      // Nothing
   }
});

client.on("channelUpdate", async (_oldCh, newCh) => {
   try {
      if (!isReady) return;
      const newChannel = newCh as VoiceChannel | StageChannel | TextChannel;
      const changedChannel = await QueueChannelTable.get(newCh.id);
      if (changedChannel) {
         const queueGuild = await QueueGuildTable.get(changedChannel.guild_id);
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, newChannel);
      }
   } catch (e) {
      // Nothing
   }
});

// Monitor for users joining voice channels
client.on("voiceStateUpdate", async (oldVoiceState, newVoiceState) => {
   try {
      if (!isReady) return;
      const oldVoiceChannel = oldVoiceState?.channel as VoiceChannel | StageChannel;
      const newVoiceChannel = newVoiceState?.channel as VoiceChannel | StageChannel;

      const member = newVoiceState.member || oldVoiceState.member;
      // Ignore mutes and deafens
      if (oldVoiceChannel === newVoiceChannel || !member) return;

      const queueGuild = await QueueGuildTable.get(member.guild.id);
      const storedOldQueueChannel = oldVoiceChannel ? await QueueChannelTable.get(oldVoiceChannel.id) : undefined;
      const storedNewQueueChannel = newVoiceChannel ? await QueueChannelTable.get(newVoiceChannel.id) : undefined;

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
            const targetChannel = (await member.guild.channels
               .fetch(storedNewQueueChannel.target_channel_id)
               .catch(() => null)) as VoiceChannel | StageChannel;
            if (targetChannel) {
               if (
                  storedNewQueueChannel.auto_fill &&
                  newVoiceChannel.members.filter((member) => !member.user.bot).size === 1 &&
                  (!targetChannel.userLimit ||
                     targetChannel.members.filter((member) => !member.user.bot).size < targetChannel.userLimit)
               ) {
                  SchedulingUtils.scheduleMoveMember(member.voice, targetChannel);
                  return;
               }
            } else {
               // Target has been deleted - clean it up
               await QueueChannelTable.updateTarget(newVoiceChannel.id, knex.raw("DEFAULT"));
            }
         }
         try {
            await QueueMemberTable.store(newVoiceChannel, member);
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, newVoiceChannel);
         } catch (e) {
            // skip display update if store fails
         }
      }
      if (storedOldQueueChannel) {
         // Left queue channel
         if (Base.isMe(member) && newVoiceChannel) {
            await QueueChannelTable.updateTarget(oldVoiceChannel.id, newVoiceChannel.id);
            // move bot back
            SchedulingUtils.scheduleMoveMember(member.voice, oldVoiceChannel);
            await setTimeout(
               async () =>
                  await fillTargetChannel(storedOldQueueChannel, oldVoiceChannel, newVoiceChannel).catch(() => null),
               1000
            );
         } else {
            await QueueMemberTable.unstore(
               member.guild.id,
               oldVoiceChannel.id,
               [member.id],
               storedOldQueueChannel.grace_period
            );
         }
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, oldVoiceChannel);
      }
      if (!Base.isMe(member) && oldVoiceChannel) {
         // Check if leaving target channel
         const storedQueueChannels = await QueueChannelTable.getFromTarget(oldVoiceChannel.id);
         // Randomly pick a queue to pull from
         const storedQueueChannel = storedQueueChannels[~~(Math.random() * storedQueueChannels.length)];
         if (storedQueueChannel && storedQueueChannel.auto_fill) {
            const queueChannel = (await member.guild.channels
               .fetch(storedQueueChannel.queue_channel_id)
               .catch(() => null)) as VoiceChannel | StageChannel;
            if (queueChannel) {
               await fillTargetChannel(storedQueueChannel, queueChannel, oldVoiceChannel);
            }
         }
      }
   } catch (e) {
      console.error(e);
   }
});

export async function fillTargetChannel(
   storedSrcChannel: QueueChannel,
   srcChannel: VoiceChannel | StageChannel,
   dstChannel: VoiceChannel | StageChannel
): Promise<void> {
   const guild = srcChannel.guild;
   // Check to see if I have perms to drag other users into this channel.
   if (dstChannel.permissionsFor(guild.me).has("CONNECT")) {
      // Swap bot with nextQueueMember. If the destination has a user limit, swap and add enough users to fill the limit.
      let storedMembers = await QueueMemberTable.getNext(srcChannel);
      if (storedMembers.length > 0) {
         if (!storedSrcChannel.auto_fill) {
            storedMembers = storedMembers.slice(0, storedSrcChannel.pull_num);
         }
         if (dstChannel.userLimit) {
            const num = Math.max(
               0,
               dstChannel.userLimit - dstChannel.members.filter((member) => !member.user.bot).size
            );
            storedMembers = storedMembers.slice(0, num);
         }
         for await (const storedMember of storedMembers) {
            const queueMember = await QueueMemberTable.getMemberFromQueueMember(srcChannel, storedMember);
            if (!queueMember) continue;
            SchedulingUtils.scheduleMoveMember(queueMember.voice, dstChannel);
         }
      }
   } else {
      // Request perms in display channel chat
      const storedDisplayChannel = await DisplayChannelTable.getFirstFromQueue(srcChannel.id);
      if (storedDisplayChannel) {
         const displayChannel = (await guild.channels
            .fetch(storedDisplayChannel.display_channel_id)
            .catch(() => null)) as TextChannel;
         await displayChannel.send(
            `I need the **CONNECT** permission in the \`${dstChannel.name}\` voice channel to pull in queue members.`
         );
      } else {
         const owner = await guild.fetchOwner();
         owner
            .send(
               `I need the **CONNECT** permission in the \`${dstChannel.name}\` voice channel to pull in queue members.`
            )
            .catch(() => null);
      }
   }
}

async function joinLeaveButton(interaction: ButtonInteraction): Promise<void> {
   try {
      const storedDisplayChannel = await DisplayChannelTable.getFromMessage(interaction.message.id);
      if (!storedDisplayChannel) throw "storedDisplayChannel not found";
      const queueChannel = (await interaction.guild.channels
         .fetch(storedDisplayChannel.queue_channel_id)
         .catch(() => null)) as VoiceChannel | StageChannel | TextChannel;
      if (!queueChannel) throw "queueChannel not found";
      const member = await queueChannel.guild.members.fetch(interaction.user.id);
      const storedQueueMember = await QueueMemberTable.get(queueChannel.id, member.id);
      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      if (storedQueueMember) {
         await QueueMemberTable.unstore(member.guild.id, queueChannel.id, [member.id], storedQueueChannel.grace_period);
         await interaction.reply({ content: `You left \`${queueChannel.name}\`.`, ephemeral: true }).catch(() => null);
      } else {
         try {
            await QueueMemberTable.store(queueChannel, member);
            await interaction
               .reply({ content: `You joined \`${queueChannel.name}\`.`, ephemeral: true })
               .catch(() => null);
         } catch (e: any) {
            if (e.author === "Queue Bot") {
               await interaction.reply({ content: "**ERROR**: " + e.message, ephemeral: true }).catch(() => null);
               return;
            } else {
               throw e;
            }
         }
      }
      const queueGuild = await QueueGuildTable.get(interaction.guild.id);
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
   } catch (e) {
      console.error(e);
      await interaction.reply("An error has occurred").catch(() => null);
   }
}
