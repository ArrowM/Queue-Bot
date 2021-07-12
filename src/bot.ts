import DBL from "dblapi.js";
import { ButtonInteraction, Guild, Interaction, Snowflake, TextChannel, VoiceChannel } from "discord.js";
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
import { Parsed } from "./utilities/ParsingUtils";
import { PriorityTable } from "./utilities/tables/PriorityTable";
import { PatchingUtil } from "./utilities/PatchingUtil";

// Setup client
EventEmitter.defaultMaxListeners = 0; // Maximum number of events that can be handled at once.

let isReady = false;
const config = Base.getConfig();
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
client.on("rateLimit", (rateLimitInfo) => {
   console.error(`Rate limit error:\n${util.inspect(rateLimitInfo, { depth: null })}`);
});

// Top GG integration
if (config.topGgToken) {
   const dbl = new DBL(config.topGgToken, client);
   dbl.on("error", () => null);
}

client.on("interactionCreate", async (interaction: Interaction) => {
   if (!isReady) return;
   if (interaction.isButton()) {
      switch (interaction?.customId) {
         case "joinLeave":
            joinLeaveButton(interaction);
            break;
      }
   } else if (interaction.isCommand()) {
      const parsed = new Parsed(interaction);
      await parsed.setup();
      // -- EVERYONE --
      switch (interaction.commandName) {
         case "help":
            switch (parsed.command.options.first()?.value) {
               case undefined:
                  Commands.help(parsed);
                  break;
               case "setup":
                  Commands.helpSetup(parsed);
                  break;
               case "queues":
                  Commands.helpQueue(parsed);
                  break;
               case "bot":
                  Commands.helpBot(parsed);
                  break;
            }
            break;
         case "join":
            Commands.join(parsed);
            break;
         case "myqueues":
            Commands.myqueues(parsed);
            break;
      }
      if (!parsed.hasPermission) {
         await parsed.command.reply({ content: "ERROR: Missing permission to use that command", ephemeral: true }).catch(() => null);
         return;
      }
      // -- RESTRICTED --
      switch (interaction.commandName) {
         case "autopull":
            switch (parsed.command.options.firstKey()) {
               case "get":
                  Commands.autopullGet(parsed);
                  break;
               case "set":
                  Commands.autopullSet(parsed);
                  break;
            }
            break;
         case "blacklist":
            switch (parsed.command.options.firstKey()) {
               case "add":
                  Commands.blacklistAdd(parsed);
                  break;
               case "delete":
                  Commands.blacklistDelete(parsed);
                  break;
               case "list":
                  Commands.blacklistList(parsed);
                  break;
            }
            break;
         case "clear":
            Commands.clear(parsed);
            break;
         case "color":
            switch (parsed.command.options.firstKey()) {
               case "get":
                  Commands.colorGet(parsed);
                  break;
               case "set":
                  Commands.colorSet(parsed);
                  break;
            }
            break;
         case "display":
            Commands.display(parsed);
            break;
         case "enqueue":
            Commands.enqueue(parsed);
            break;
         case "graceperiod":
            switch (parsed.command.options.firstKey()) {
               case "get":
                  Commands.graceperiodGet(parsed);
                  break;
               case "set":
                  Commands.graceperiodSet(parsed);
                  break;
            }
            break;
         case "header":
            switch (parsed.command.options.firstKey()) {
               case "get":
                  Commands.headerGet(parsed);
                  break;
               case "set":
                  Commands.headerSet(parsed);
                  break;
            }
            break;
         case "kick":
            Commands.kick(parsed);
            break;
         case "kickall":
            Commands.kickAll(parsed);
            break;
         case "leave":
            Commands.leave(parsed);
            break;
         case "mention":
            Commands.mention(parsed);
            break;
         case "mode":
            switch (parsed.command.options.firstKey()) {
               case "get":
                  Commands.modeGet(parsed);
                  break;
               case "set":
                  Commands.modeSet(parsed);
                  break;
            }
            break;
         case "next":
            Commands.next(parsed);
            break;
         case "permission":
            switch (parsed.command.options.firstKey()) {
               case "add":
                  Commands.permissionAdd(parsed);
                  break;
               case "delete":
                  Commands.permissionDelete(parsed);
                  break;
               case "list":
                  Commands.permissionList(parsed);
                  break;
            }
            break;
         case "priority":
            switch (parsed.command.options.firstKey()) {
               case "add":
                  Commands.priorityAdd(parsed);
                  break;
               case "delete":
                  Commands.priorityDelete(parsed);
                  break;
               case "list":
                  Commands.priorityList(parsed);
                  break;
            }
            break;
         case "pullnum":
            switch (parsed.command.options.firstKey()) {
               case "get":
                  Commands.pullnumGet(parsed);
                  break;
               case "set":
                  Commands.pullnumSet(parsed);
                  break;
            }
            break;
         case "queues":
            switch (parsed.command.options.firstKey()) {
               case "add":
                  Commands.queuesAdd(parsed);
                  break;
               case "delete":
                  Commands.queuesDelete(parsed);
                  break;
               case "list":
                  Commands.queuesList(parsed);
                  break;
            }
            break;
         case "shuffle":
            Commands.shuffle(parsed);
            break;
         case "size":
            switch (parsed.command.options.firstKey()) {
               case "get":
                  Commands.sizeGet(parsed);
                  break;
               case "set":
                  Commands.sizeSet(parsed);
                  break;
            }
            break;
         case "start":
            Commands.start(parsed);
            break;
      }
   }
});

const prefixCache = new Map<Snowflake, string>();
let hasPrefix: boolean;
client.on("messageCreate", async (message) => {
   const guildId = message?.guild?.id;
   if (!isReady || !guildId) return;
   if (hasPrefix === undefined) {
      hasPrefix = await Base.getKnex().schema.hasColumn("queue_guilds", "prefix");
   } else if (hasPrefix === false) {
      return;
   } else {
      let prefix = prefixCache.get(guildId);
      if (prefix === undefined) {
         let prefix = (await QueueGuildTable.get(guildId))?.prefix;
         prefixCache.set(guildId, prefix);
      } else if (prefix === null) {
         return;
      } else if (message.content === prefix + "help") {
         await message.reply(`I no longer respond to your old prefix (\`${prefix}\`). Try using the new slash commands! Like \`/help\`.`).catch(() => null);
      }
   }
});

async function resumeAfterOffline(): Promise<void> {
   //// VALIDATE ENTRIES
   //console.log("Validating Queue Guilds...");
   //await QueueGuildTable.validateEntries();
   //console.log("Validated Queue Guilds.");
   //console.log("Validating Admin Permissions...");
   //await AdminPermissionTable.validateEntries();
   //console.log("Validated Admin Permissions.");
   //console.log("Validating Priority entries...");
   //await PriorityTable.validateEntries();
   //console.log("Validated Priority entries.");

   //// Update Queues
   //const storedQueueGuilds = await QueueGuildTable.getAll();
   //for await (const storedQueueGuild of storedQueueGuilds) {
   //   const guild = await client.guilds.fetch(storedQueueGuild.guild_id).catch(() => null as Guild);
   //   if (!guild) continue;
   //   // Clean queue channels
   //   console.log("Updating Queues for Guild: " + guild.name);
   //   const queueChannels = await QueueChannelTable.fetchFromGuild(guild);
   //   for await (const queueChannel of queueChannels) {
   //      if (queueChannel.type !== "GUILD_VOICE") continue;
   //      let updateDisplay = false;

   //      // Fetch stored and live members
   //      const storedQueueMemberIds = (await QueueMemberTable.getFromQueue(queueChannel)).map((member) => member.member_id);
   //      const queueMembers = queueChannel.members.filter((member) => !Base.isMe(member)).array();

   //      // Update member lists
   //      for await (const storedQueueMemberId of storedQueueMemberIds) {
   //         if (!queueMembers.some((queueMember) => queueMember.id === storedQueueMemberId)) {
   //            updateDisplay = true;
   //            await QueueMemberTable.get(queueChannel.id, storedQueueMemberId).delete();
   //         }
   //      }
   //      for await (const queueMember of queueMembers) {
   //         if (!storedQueueMemberIds.includes(queueMember.id)) {
   //            updateDisplay = true;
   //            await QueueMemberTable.store(queueChannel, queueMember);
   //         }
   //      }
   //      if (updateDisplay) {
   //         SchedulingUtils.scheduleDisplayUpdate(storedQueueGuild, queueChannel);
   //      }
   //   }
   //}
   console.log("Done resuming...")
}

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once("ready", async () => {
   console.time("READY. Bot started in");
   await PatchingUtil.run();
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
   await PriorityTable.unstore(role.guild.id, role.id);
   const queueGuild = await QueueGuildTable.get(role.guild.id);
   const queueChannels = await QueueChannelTable.fetchFromGuild(role.guild);
   for (const queueChannel of queueChannels) {
      await SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
   }
});

client.on("guildMemberRemove", async (guildMember) => {
   if (!isReady) return;
   const queueGuild = await QueueGuildTable.get(guildMember.guild.id);
   const queueChannels = await QueueChannelTable.fetchFromGuild(guildMember.guild);
   for (const queueChannel of queueChannels) {
      await QueueMemberTable.unstore(queueChannel.id, [guildMember.id]);
      await SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
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

client.on("channelUpdate", async (_oldChannel, newCh) => {
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
         await QueueMemberTable.store(newVoiceChannel, member);
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
            await QueueMemberTable.unstore(oldVoiceChannel.id, [member.id], storedOldQueueChannel.grace_period);
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
      // Swap bot with nextQueueMember. If the destination has a user limit, swap with add enough users to fill the limit.
      let storedQueueMembers = await QueueMemberTable.getNext(srcChannel);
      if (storedQueueMembers.length > 0) {
         if (!storedSrcChannel.auto_fill) {
            storedQueueMembers = storedQueueMembers.slice(0, storedSrcChannel.pull_num);
         }
         if (dstChannel.userLimit) {
            storedQueueMembers = storedQueueMembers.slice(
               0,
               dstChannel.userLimit - dstChannel.members.filter((member) => !member.user.bot).size
            );
         }
         const queueMembers = storedQueueMembers.map((member) => member.member).filter((member) => member);
         if (queueMembers.length > 0) {
            queueMembers.forEach((member) => {
               SchedulingUtils.scheduleMoveMember(member.voice, dstChannel);
            });
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
      const queueChannel = (await interaction.guild.channels.fetch(storedDisplayChannel.queue_channel_id).catch(() => null)) as
         | TextChannel
         | VoiceChannel;
      const member = await queueChannel.guild.members.fetch(interaction.user.id);
      const storedQueueMember = await QueueMemberTable.get(queueChannel.id, member.id);
      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      if (storedQueueMember) {
         await QueueMemberTable.unstore(queueChannel.id, [member.id], storedQueueChannel.grace_period);
         await interaction.reply({ content: `You left \`${queueChannel.name}\`.`, ephemeral: true }).catch(() => null);
      } else {
         if (await QueueMemberTable.store(queueChannel, member)) {
            await interaction.reply({ content: `You joined \`${queueChannel.name}\`.`, ephemeral: true }).catch(() => null);
         } else {
            await interaction.reply({ content: `**ERROR**: You are blacklisted from \`${queueChannel.name}\``, ephemeral: true }).catch(() => null);
         }
      }
      const queueGuild = await QueueGuildTable.get(interaction.guild.id);
      SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
   } catch (e) {
      console.error(e);
      await interaction.reply("An error has occured").catch(() => null);
   }
}
