import DBL from "dblapi.js";
import { ButtonInteraction, Guild, Interaction, TextChannel, VoiceChannel } from "discord.js";
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

// Setup client
console.time("READY. Bot started in");
EventEmitter.defaultMaxListeners = 0; // Maximum number of events that can be handled at once.

let isReady = false;
const config = Base.config;
const client = Base.client;
const knex = Base.knex;
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
client.on("rateLimit", (rateLimitInfo) => {
   console.error(`Rate limit error:\n${util.inspect(rateLimitInfo, { depth: null })}`);
});

// Top GG integration
if (config.topGgToken) {
   const dbl = new DBL(config.topGgToken, client);
   dbl.on("error", () => null);
}

client.on("interactionCreate", async (interaction: Interaction) => {
   try {
      if (interaction.isButton()) {
         if (!isReady) return;
         if (!interaction.guild?.id) return;

         switch (interaction?.customId) {
            case "joinLeave":
               joinLeaveButton(interaction);
               break;
         }
      } else if (interaction.isCommand()) {
         if (!isReady) {
            interaction.reply("Bot is starting up. Please try again in 5 seconds...");
            return;
         }
         if (!interaction.guild?.id) {
            interaction.reply("Commands can only be used in servers.");
            return;
         }

         const parsed = new ParsedCommand(interaction);
         await parsed.setup();
         // -- EVERYONE COMMANDS --
         switch (interaction.commandName) {
            case "help":
               switch (parsed.request.options.first()?.value) {
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
            default:
               await onAdminCommand(parsed);
               break;
         }
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

async function onAdminCommand(parsed: ParsedCommand) {
   if (!(await checkPermission(parsed))) return false;
   // -- ADMIN COMMANDS --
   switch (parsed.request.commandName) {
      case "altprefix":
         await Commands.altPrefix(parsed);
         break;
      case "autopull":
         switch (parsed.request.options.firstKey()) {
            case "get":
               await Commands.autopullGet(parsed);
               break;
            case "set":
               await Commands.autopullSet(parsed);
               break;
         }
         break;
      case "blacklist":
         switch (parsed.request.options.firstKey()) {
            case "add":
               switch (parsed.request.options.first().options.firstKey()) {
                  case "user":
                     await Commands.blacklistAddUser(parsed);
                     break;
                  case "role":
                     await Commands.blacklistAddRole(parsed);
                     break;
               }
               break;
            case "delete":
               switch (parsed.request.options.first().options.firstKey()) {
                  case "user":
                     await Commands.blacklistDeleteUser(parsed);
                     break;
                  case "role":
                     await Commands.blacklistDeleteRole(parsed);
                     break;
               }
               break;
            case "list":
               await Commands.blacklistList(parsed);
               break;
         }
         break;
      case "clear":
         await Commands.clear(parsed);
         break;
      case "color":
         switch (parsed.request.options.firstKey()) {
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
         switch (parsed.request.options.firstKey()) {
            case "user":
               await Commands.enqueueUser(parsed);
               break;
            case "role":
               await Commands.enqueueRole(parsed);
               break;
         }
         break;
      case "graceperiod":
         switch (parsed.request.options.firstKey()) {
            case "get":
               await Commands.graceperiodGet(parsed);
               break;
            case "set":
               await Commands.graceperiodSet(parsed);
               break;
         }
         break;
      case "header":
         switch (parsed.request.options.firstKey()) {
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
      case "mode":
         switch (parsed.request.options.firstKey()) {
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
         switch (parsed.request.options.firstKey()) {
            case "add":
               switch (parsed.request.options.first().options.firstKey()) {
                  case "user":
                     await Commands.permissionAddUser(parsed);
                     break;
                  case "role":
                     await Commands.permissionAddRole(parsed);
                     break;
               }
               break;
            case "delete":
               switch (parsed.request.options.first().options.firstKey()) {
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
         }
         break;
      case "priority":
         switch (parsed.request.options.firstKey()) {
            case "add":
               switch (parsed.request.options.first().options.firstKey()) {
                  case "user":
                     await Commands.priorityAddUser(parsed);
                     break;
                  case "role":
                     await Commands.priorityAddRole(parsed);
                     break;
               }
               break;
            case "delete":
               switch (parsed.request.options.first().options.firstKey()) {
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
         }
         break;
      case "pullnum":
         switch (parsed.request.options.firstKey()) {
            case "get":
               await Commands.pullnumGet(parsed);
               break;
            case "set":
               await Commands.pullnumSet(parsed);
               break;
         }
         break;
      case "queues":
         switch (parsed.request.options.firstKey()) {
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
         switch (parsed.request.options.firstKey()) {
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
      case "update":
         await Commands.update(parsed);
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
      const commandName = message.content.substring(1);
      if (parsed.queueGuild.enable_alt_prefix) {
         // - EVERYONE
         if (commandName.startsWith("join")) {
            await Commands.join(parsed);
         } else if (commandName.startsWith("leave")) {
            await Commands.leave(parsed);
         } else if (commandName.startsWith("myqueues")) {
            await Commands.myqueues(parsed);
         } else if (commandName === "help") {
            await Commands.help(parsed);
         } else if (commandName.startsWith("help setup")) {
            await Commands.helpSetup(parsed);
         } else if (commandName.startsWith("help queues")) {
            await Commands.helpQueue(parsed);
         } else if (commandName.startsWith("help bot")) {
            await Commands.helpBot(parsed);
         }
         // - ADMIN
         if (commandName.startsWith("altprefix") && (await checkPermission(parsed))) {
            await Commands.altPrefix(parsed);
         } else if (commandName.startsWith("autopull get") && (await checkPermission(parsed))) {
            await Commands.autopullGet(parsed);
         } else if (commandName.startsWith("autopull set") && (await checkPermission(parsed))) {
            await Commands.autopullSet(parsed);
         } else if (commandName.startsWith("blacklist add user") && (await checkPermission(parsed))) {
            await Commands.blacklistAddUser(parsed);
         } else if (commandName.startsWith("blacklist add role") && (await checkPermission(parsed))) {
            await Commands.blacklistAddRole(parsed);
         } else if (commandName.startsWith("blacklist delete user") && (await checkPermission(parsed))) {
            await Commands.blacklistDeleteUser(parsed);
         } else if (commandName.startsWith("blacklist delete role") && (await checkPermission(parsed))) {
            await Commands.blacklistDeleteRole(parsed);
         } else if (commandName.startsWith("blacklist list") && (await checkPermission(parsed))) {
            await Commands.blacklistList(parsed);
         } else if (commandName.startsWith("clear") && (await checkPermission(parsed))) {
            await Commands.clear(parsed);
         } else if (commandName.startsWith("color get") && (await checkPermission(parsed))) {
            await Commands.colorGet(parsed);
         } else if (commandName.startsWith("color set") && (await checkPermission(parsed))) {
            await Commands.colorSet(parsed);
         } else if (commandName.startsWith("display") && (await checkPermission(parsed))) {
            await Commands.display(parsed);
         } else if (commandName.startsWith("enqueue user") && (await checkPermission(parsed))) {
            await Commands.enqueueUser(parsed);
         } else if (commandName.startsWith("enqueue role") && (await checkPermission(parsed))) {
            await Commands.enqueueRole(parsed);
         } else if (commandName.startsWith("graceperiod get") && (await checkPermission(parsed))) {
            await Commands.graceperiodGet(parsed);
         } else if (commandName.startsWith("graceperiod set") && (await checkPermission(parsed))) {
            await Commands.graceperiodSet(parsed);
         } else if (commandName.startsWith("header get") && (await checkPermission(parsed))) {
            await Commands.headerGet(parsed);
         } else if (commandName.startsWith("header set") && (await checkPermission(parsed))) {
            await Commands.headerSet(parsed);
         } else if (commandName.startsWith("kick ") && (await checkPermission(parsed))) {
            await Commands.kick(parsed);
         } else if (commandName.startsWith("kickall") && (await checkPermission(parsed))) {
            await Commands.kickAll(parsed);
         } else if (commandName.startsWith("mode get") && (await checkPermission(parsed))) {
            await Commands.modeGet(parsed);
         } else if (commandName.startsWith("mode set") && (await checkPermission(parsed))) {
            await Commands.modeSet(parsed);
         } else if (commandName.startsWith("next") && (await checkPermission(parsed))) {
            await Commands.next(parsed);
         } else if (commandName.startsWith("permission add user") && (await checkPermission(parsed))) {
            await Commands.permissionAddUser(parsed);
         } else if (commandName.startsWith("permission add role") && (await checkPermission(parsed))) {
            await Commands.permissionAddRole(parsed);
         } else if (commandName.startsWith("permission delete user") && (await checkPermission(parsed))) {
            await Commands.permissionDeleteUser(parsed);
         } else if (commandName.startsWith("permission delete role") && (await checkPermission(parsed))) {
            await Commands.permissionDeleteRole(parsed);
         } else if (commandName.startsWith("permission list") && (await checkPermission(parsed))) {
            await Commands.permissionList(parsed);
         } else if (commandName.startsWith("priority add user") && (await checkPermission(parsed))) {
            await Commands.priorityAddUser(parsed);
         } else if (commandName.startsWith("priority add role") && (await checkPermission(parsed))) {
            await Commands.priorityAddRole(parsed);
         } else if (commandName.startsWith("priority delete user") && (await checkPermission(parsed))) {
            await Commands.priorityDeleteUser(parsed);
         } else if (commandName.startsWith("priority delete role") && (await checkPermission(parsed))) {
            await Commands.priorityDeleteRole(parsed);
         } else if (commandName.startsWith("priority list") && (await checkPermission(parsed))) {
            await Commands.priorityList(parsed);
         } else if (commandName.startsWith("pullnum get") && (await checkPermission(parsed))) {
            await Commands.pullnumGet(parsed);
         } else if (commandName.startsWith("pullnum set") && (await checkPermission(parsed))) {
            await Commands.pullnumSet(parsed);
         } else if (commandName.startsWith("queues add") && (await checkPermission(parsed))) {
            await Commands.queuesAdd(parsed);
         } else if (commandName.startsWith("queues delete") && (await checkPermission(parsed))) {
            await Commands.queuesDelete(parsed);
         } else if (commandName.startsWith("queues list") && (await checkPermission(parsed))) {
            await Commands.queuesList(parsed);
         } else if (commandName.startsWith("shuffle") && (await checkPermission(parsed))) {
            await Commands.shuffle(parsed);
         } else if (commandName.startsWith("size get") && (await checkPermission(parsed))) {
            await Commands.sizeGet(parsed);
         } else if (commandName.startsWith("size set") && (await checkPermission(parsed))) {
            await Commands.sizeSet(parsed);
         } else if (commandName.startsWith("start") && (await checkPermission(parsed))) {
            await Commands.start(parsed);
         } else if (commandName.startsWith("update") && (await checkPermission(parsed))) {
            await Commands.update(parsed);
         }
      }
   } catch (e) {
      console.error(e);
   }
});

async function resumeAfterOffline(): Promise<void> {
   // VALIDATE ENTRIES
   console.log("Validating Queue Guilds...");
   await QueueGuildTable.validateEntries();
   console.log("Validated Queue Guilds.");
   console.log("Validating Admin Permissions...");
   await AdminPermissionTable.validateEntries();
   console.log("Validated Admin Permissions.");
   console.log("Validating Priority entries...");
   await PriorityTable.validateEntries();
   console.log("Validated Priority entries.");

   // Update Queues
   const storedQueueGuilds = await QueueGuildTable.getAll();
   for await (const storedQueueGuild of storedQueueGuilds) {
      const guild = await client.guilds.fetch(storedQueueGuild.guild_id).catch(() => null as Guild);
      if (!guild) continue;
      // Clean queue channels
      console.log("Updating Queues for Guild: " + guild.name);
      const queueChannels = await QueueChannelTable.fetchFromGuild(guild);
      for await (const queueChannel of queueChannels) {
         if (queueChannel.type !== "GUILD_VOICE") continue;
         let updateDisplay = false;

         // Fetch stored and live members
         const storedMemberIds = (await QueueMemberTable.getFromQueue(queueChannel)).map((member) => member.member_id);
         const queueMembers = queueChannel.members.filter((member) => !Base.isMe(member)).array();

         // Update member lists
         for await (const storedMemberId of storedMemberIds) {
            if (!queueMembers.some((queueMember) => queueMember.id === storedMemberId)) {
               updateDisplay = true;
               await QueueMemberTable.unstore(guild.id, queueChannel.id, [storedMemberId]);
            }
         }
         for await (const queueMember of queueMembers) {
            if (!storedMemberIds.includes(queueMember.id)) {
               updateDisplay = true;
               await QueueMemberTable.store(queueChannel, queueMember).catch(() => null);
            }
         }
         if (updateDisplay) {
            SchedulingUtils.scheduleDisplayUpdate(storedQueueGuild, queueChannel);
         }
      }
   }
   console.log("Done resuming...");
}

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once("ready", async () => {
   await PatchingUtils.run();
   await QueueGuildTable.initTable();
   await QueueChannelTable.initTable();
   await DisplayChannelTable.initTable();
   await QueueMemberTable.initTable();
   await BlackWhiteListTable.initTable();
   await AdminPermissionTable.initTable();
   await PriorityTable.initTable();
   await SchedulingUtils.startScheduler();
   console.timeEnd("READY. Bot started in");
   isReady = true;
   //await resumeAfterOffline();
});

client.on("shardResume", async () => {
   //await resumeAfterOffline();
   console.log("Reconnected!");
});

client.on("guildCreate", async (guild) => {
   if (!isReady) return;
   await QueueGuildTable.store(guild);
});

client.on("roleDelete", async (role) => {
   if (!isReady) return;
   if (await PriorityTable.get(role.guild.id, role.id)) {
      await PriorityTable.unstore(role.guild.id, role.id);
      const queueGuild = await QueueGuildTable.get(role.guild.id);
      const queueChannels = await QueueChannelTable.fetchFromGuild(role.guild);
      for (const queueChannel of queueChannels) {
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
      }
   }
});

client.on("guildMemberRemove", async (guildMember) => {
   if (!isReady) return;
   const queueGuild = await QueueGuildTable.get(guildMember.guild.id);
   const queueChannels = await QueueChannelTable.fetchFromGuild(guildMember.guild);
   for await (const queueChannel of queueChannels) {
      await QueueMemberTable.unstore(queueGuild.guild_id, queueChannel.id, [guildMember.id]);
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
   }
});

client.on("guildDelete", async (guild) => {
   if (!isReady) return;
   await QueueGuildTable.unstore(guild.id);
});

client.on("channelDelete", async (channel) => {
   if (!isReady) return;
   const deletedQueueChannel = await QueueChannelTable.get(channel.id);
   if (deletedQueueChannel) {
      await QueueChannelTable.unstore(deletedQueueChannel.guild_id, deletedQueueChannel.queue_channel_id);
   }
   await DisplayChannelTable.getFromQueue(channel.id).delete();
});

client.on("channelUpdate", async (_oldCh, newCh) => {
   if (!isReady) return;
   const newChannel = newCh as VoiceChannel | TextChannel;
   const changedChannel = await QueueChannelTable.get(newCh.id);
   if (changedChannel) {
      const queueGuild = await QueueGuildTable.get(changedChannel.guild_id);
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, newChannel);
   }
});

// Monitor for users joining voice channels
client.on("voiceStateUpdate", async (oldVoiceState, newVoiceState) => {
   try {
      if (!isReady) return;
      const oldVoiceChannel = oldVoiceState?.channel as VoiceChannel;
      const newVoiceChannel = newVoiceState?.channel as VoiceChannel;

      const member = newVoiceState.member || oldVoiceState.member;
      // Ignore mutes and deafens
      if (oldVoiceChannel === newVoiceChannel || !member) return;

      const queueGuild = await QueueGuildTable.get(member.guild.id);
      const storedOldQueueChannel = oldVoiceChannel ? await QueueChannelTable.get(oldVoiceChannel.id) : undefined;
      const storedNewQueueChannel = newVoiceChannel ? await QueueChannelTable.get(newVoiceChannel.id) : undefined;

      if (Base.isMe(member) && ((storedOldQueueChannel && storedNewQueueChannel) || !oldVoiceChannel || !newVoiceChannel)) {
         // Ignore when the bot moves between queues or when it starts and stops
         return;
      }
      if (storedNewQueueChannel && !Base.isMe(member)) {
         // Joined queue channel
         if (storedNewQueueChannel.target_channel_id) {
            const targetChannel = (await member.guild.channels
               .fetch(storedNewQueueChannel.target_channel_id)
               .catch(() => null)) as VoiceChannel;
            if (targetChannel) {
               if (
                  storedNewQueueChannel.auto_fill &&
                  newVoiceChannel.members.filter((member) => !member.user.bot).size === 1 &&
                  (!targetChannel.userLimit || targetChannel.members.filter((member) => !member.user.bot).size < targetChannel.userLimit)
               ) {
                  SchedulingUtils.scheduleMoveMember(member.voice, targetChannel);
                  return;
               }
            } else {
               // Target has been deleted - clean it up
               await QueueChannelTable.updateTarget(newVoiceChannel.id, knex.raw("DEFAULT"));
            }
         }
         await QueueMemberTable.store(newVoiceChannel, member).catch(() => null);
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
            await QueueMemberTable.unstore(member.guild.id, oldVoiceChannel.id, [member.id], storedOldQueueChannel.grace_period);
         }
         SchedulingUtils.scheduleDisplayUpdate(queueGuild, oldVoiceChannel);
      }
      if (!Base.isMe(member) && oldVoiceChannel) {
         // Check if leaving target channel
         const storedQueueChannels = await QueueChannelTable.getFromTarget(oldVoiceChannel.id);
         // Randomly pick a queue to pull from
         const storedQueueChannel = storedQueueChannels[~~(Math.random() * storedQueueChannels.length)];
         if (storedQueueChannel && storedQueueChannel.auto_fill) {
            const queueChannel = (await member.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)) as VoiceChannel;
            if (queueChannel) {
               await fillTargetChannel(storedQueueChannel, queueChannel, oldVoiceChannel);
            }
         }
      }
   } catch (e) {
      console.error(e);
   }
});

export async function fillTargetChannel(storedSrcChannel: QueueChannel, srcChannel: VoiceChannel, dstChannel: VoiceChannel): Promise<void> {
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
            const num = Math.max(0, dstChannel.userLimit - dstChannel.members.filter((member) => !member.user.bot).size);
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
      const storedDisplayChannel = await DisplayChannelTable.getFromQueue(srcChannel.id).first();
      if (storedDisplayChannel) {
         const displayChannel = (await guild.channels.fetch(storedDisplayChannel.display_channel_id).catch(() => null)) as TextChannel;
         displayChannel.send(`I need the **CONNECT** permission in the \`${dstChannel.name}\` voice channel to pull in queue members.`);
      } else {
         const owner = await guild.fetchOwner();
         owner
            .send(`I need the **CONNECT** permission in the \`${dstChannel.name}\` voice channel to pull in queue members.`)
            .catch(() => null);
      }
   }
}

async function joinLeaveButton(interaction: ButtonInteraction): Promise<void> {
   try {
      const storedDisplayChannel = await DisplayChannelTable.getFromMessage(interaction.message.id);
      if (!storedDisplayChannel) throw "storedDisplayChannel not found";
      const queueChannel = (await interaction.guild.channels.fetch(storedDisplayChannel.queue_channel_id).catch(() => null)) as
         | TextChannel
         | VoiceChannel;
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
            await interaction.reply({ content: `You joined \`${queueChannel.name}\`.`, ephemeral: true }).catch(() => null);
         } catch (e) {
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
      await interaction.reply("An error has occured").catch(() => null);
   }
}
