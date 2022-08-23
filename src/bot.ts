import {
  ButtonInteraction,
  GuildBasedChannel,
  GuildMember,
  Interaction,
  Message,
  PartialGuildMember,
  StageChannel,
  VoiceChannel,
  VoiceState,
} from "discord.js";
import { EventEmitter } from "events";
import { AutoPoster } from "topgg-autoposter";
import util from "util";

import { Commands } from "./Commands";
import { Base } from "./utilities/Base";
import { Parsed, StoredQueue } from "./utilities/Interfaces";
import { MessagingUtils } from "./utilities/MessagingUtils";
import { ParsedCommand, ParsedMessage } from "./utilities/ParsingUtils";
import { PatchingUtils } from "./utilities/PatchingUtils";
import { SchedulingUtils } from "./utilities/SchedulingUtils";
import { SlashCommands } from "./utilities/SlashCommands";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { PriorityTable } from "./utilities/tables/PriorityTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import { QueueTable } from "./utilities/tables/QueueTable";

// Setup client
console.time("READY. Bot started in");
EventEmitter.defaultMaxListeners = 0; // Maximum number of events that can be handled at once.

let isReady = false;
const config = Base.config;
const client = Base.client;
client.login(config.token).then();
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
//   console.error(`Rate limit error:\n${util.inspect(rateLimitInfo, { depth: null })}`);
// });

// Top GG integration
if (config.topGgToken) {
  AutoPoster(config.topGgToken, client).on("error", () => null);
}

//
// --- DISCORD EVENTS ---
//

interface CommandArg {
  name: string;
  value: string | boolean | number;
}

client.on("interactionCreate", async (interaction: Interaction) => {
  try {
    if (interaction.isButton()) {
      if (isReady && interaction.guild?.id && interaction.customId === "joinLeave") {
        await joinLeaveButton(interaction);
      }
    } else if (interaction.isCommand()) {
      if (!isReady) {
        await interaction.reply("Bot is starting up. Please try again in 5 seconds...");
      } else if (!interaction.guild?.id) {
        await interaction.reply("Commands can only be used in servers.");
      } else {
        const parsed = new ParsedCommand(interaction);
        await parsed.setup();

        const commands: CommandArg[] = [{ name: parsed.request.commandName, value: undefined }];
        let obj = parsed.request.options?.data;
        while (obj) {
          commands.push({ name: obj?.[0]?.name, value: obj?.[0]?.value });
          obj = obj?.[0]?.options;
        }
        await processCommand(parsed, commands);
      }
    }
  } catch (e: any) {
    console.error(e);
  }
});

function isTextCommand(message: Message): boolean {
  if (message.content[0] === "!") {
    message.content = message.content.slice(1).trimStart();
    return true;
  } else if (message.guild.me?.id) {
    const regExp = RegExp(`^<@!?${message.guild.me.id}>`);
    if (regExp.test(message.content)) {
      // Remove bot mention from content
      message.content = message.content.slice(message.content.indexOf(">") + 1).trimStart();
      return true;
    }
  }
  return false;
}

client.on("messageCreate", async (message) => {
  try {
    const guildId = message.guild?.id;
    if (isReady && guildId && isTextCommand(message)) {
      const parsed = new ParsedMessage(message);
      await parsed.setup();
      if (parsed.storedGuild.enable_alt_prefix) {
        await processCommand(
          parsed,
          message.content.split(" ").map((str) => {
            return { name: str, value: undefined };
          })
        );
      }
    }
  } catch (e: any) {
    console.error(e);
  }
});

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once("ready", async () => {
  const guilds = Base.client.guilds.cache;
  Base.shuffle(guilds);
  await PatchingUtils.run(guilds);
  SlashCommands.register(guilds).then();
  // Validator.validateAtStartup(guilds);
  SchedulingUtils.startScheduler();
  SchedulingUtils.startCommandScheduler().then();
  console.timeEnd("READY. Bot started in");
  isReady = true;
  reportStats().then();
});

async function reportStats() {
  setInterval(async () => {
    const guildCnt = client.guilds.cache.size;
    const visibleMemberCnt = client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
    const queueMemberCnt = (await Base.knex("queue_members").count("id").first()).count;
    console.log();
    console.log("# Guilds = " + guildCnt);
    console.log("# Visible members = " + visibleMemberCnt);
    console.log("# Queue members = " + queueMemberCnt);
  }, 6 * 60 * 60 * 1000); // 6 hour
}

client.on("guildCreate", async (guild) => {
  if (!isReady) {
    return;
  }
  await QueueGuildTable.store(guild).catch(() => null);
});

client.on("roleDelete", async (role) => {
  try {
    if (!isReady) {
      return;
    }
    if (await PriorityTable.get(role.guild.id, role.id)) {
      await PriorityTable.unstore(role.guild.id, role.id);
      const storedGuild = await QueueGuildTable.get(role.guild.id);
      const queueChannels = await QueueTable.fetchFromGuild(role.guild);
      for (const queueChannel of queueChannels.values()) {
        await SchedulingUtils.scheduleDisplayUpdate(storedGuild, queueChannel);
      }
    }
  } catch (e: any) {
    // Nothing
  }
});

async function memberUpdate(member: GuildMember | PartialGuildMember) {
  try {
    if (!isReady) {
      return;
    }
    const storedGuild = await QueueGuildTable.get(member.guild.id);
    const queueMembers = await QueueMemberTable.getFromMember(member.id);
    const promises = [];
    for (const queueMember of queueMembers) {
      promises.push(
        member.guild.channels
          .fetch(queueMember.channel_id)
          .catch(() => null)
          .then((ch) => SchedulingUtils.scheduleDisplayUpdate(storedGuild, ch))
      );
    }
    await Promise.all(promises);
  } catch (e: any) {
    // Nothing
  }
}

client.on("guildMemberRemove", async (guildMember) => {
  await memberUpdate(guildMember);
});

client.on("guildDelete", async (guild) => {
  if (!isReady) {
    return;
  }
  await QueueGuildTable.unstore(guild.id).catch(() => null);
});

client.on("channelDelete", async (channel) => {
  try {
    if (!isReady || channel.type === "DM") {
      return;
    }
    const deletedQueueChannel = await QueueTable.get(channel.id);
    if (deletedQueueChannel) {
      await QueueTable.unstore(deletedQueueChannel.guild_id, deletedQueueChannel.queue_channel_id);
    }
    await DisplayChannelTable.getFromQueue(channel.id).delete();
  } catch (e: any) {
    // Nothing
  }
});

client.on("channelUpdate", async (_oldCh, newCh) => {
  try {
    if (!isReady) {
      return;
    }
    const newChannel = newCh as GuildBasedChannel;
    const changedChannel = await QueueTable.get(newCh.id);
    if (changedChannel) {
      const storedGuild = await QueueGuildTable.get(changedChannel.guild_id);
      await SchedulingUtils.scheduleDisplayUpdate(storedGuild, newChannel);
    }
  } catch (e: any) {
    // Nothing
  }
});

// Monitor for users joining voice channels
client.on("voiceStateUpdate", async (oldVoiceState, newVoiceState) => {
  await processVoice(oldVoiceState, newVoiceState);
});

//
// -- Bot Processing Methods ---
//

async function checkPermission(parsed: Parsed): Promise<boolean> {
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

async function processCommand(parsed: Parsed, command: CommandArg[]) {
  switch (command[0]?.name) {
    case "display":
      await Commands.display(parsed);
      return;
    case "help":
      switch (command[1]?.value) {
        case undefined:
          await Commands.help(parsed);
          return;
        case "setup":
          await Commands.helpSetup(parsed);
          return;
        case "queues":
          await Commands.helpQueue(parsed);
          return;
        case "bot":
          await Commands.helpBot(parsed);
          return;
      }
      return;
    case "join":
      await Commands.join(parsed);
      return;
    case "leave":
      await Commands.leave(parsed);
      return;
    case "myqueues":
      await Commands.myQueues(parsed);
      return;
  }

  if (!(await checkPermission(parsed))) {
    return;
  }
  // -- ADMIN COMMANDS --
  switch (command[0]?.name) {
    case "altprefix":
      switch (command[1]?.name) {
        case "get":
          await Commands.altPrefixGet(parsed);
          return;
        case "set":
          await Commands.altPrefixSet(parsed);
          return;
      }
      return;
    case "autopull":
      switch (command[1]?.name) {
        case "get":
          await Commands.autopullGet(parsed);
          return;
        case "set":
          await Commands.autopullSet(parsed);
          return;
      }
      return;
    case "blacklist":
      switch (command[1]?.name) {
        case "add":
          switch (command[2]?.name) {
            case "user":
              await Commands.bwAdd(parsed, false, true);
              return;
            case "role":
              await Commands.bwAdd(parsed, true, true);
              return;
          }
          return;
        case "delete":
          switch (command[2]?.name) {
            case "user":
              await Commands.bwDelete(parsed, false, true);
              return;
            case "role":
              await Commands.bwDelete(parsed, true, true);
              return;
          }
          return;
        case "list":
          await Commands.bwList(parsed, true);
          return;
      }
      return;
    case "button":
      switch (command[1]?.name) {
        case "get":
          await Commands.buttonGet(parsed);
          return;
        case "set":
          await Commands.buttonSet(parsed);
          return;
      }
      return;
    case "clear":
      await Commands.clear(parsed);
      return;
    case "color":
      switch (command[1]?.name) {
        case "get":
          await Commands.colorGet(parsed);
          return;
        case "set":
          await Commands.colorSet(parsed);
          return;
      }
      return;
    case "enqueue":
      switch (command[1]?.name) {
        case "user":
          await Commands.enqueue(parsed, false);
          return;
        case "role":
          await Commands.enqueue(parsed, true);
          return;
      }
      return;
    case "graceperiod":
      switch (command[1]?.name) {
        case "get":
          await Commands.graceperiodGet(parsed);
          return;
        case "set":
          await Commands.graceperiodSet(parsed);
          return;
      }
      return;
    case "header":
      switch (command[1]?.name) {
        case "get":
          await Commands.headerGet(parsed);
          return;
        case "set":
          await Commands.headerSet(parsed);
          return;
      }
      return;
    case "dequeue":
      await Commands.dequeue(parsed);
      return;
    case "lock":
      switch (command[1]?.name) {
        case "get":
          await Commands.lockGet(parsed);
          return;
        case "set":
          await Commands.lockSet(parsed);
          return;
      }
      return;
    case "logging":
      switch (command[1]?.name) {
        case "get":
          await Commands.loggingGet(parsed);
          return;
        case "set":
          await Commands.loggingSet(parsed);
          return;
      }
      return;
    case "mentions":
      switch (command[1]?.name) {
        case "get":
          await Commands.mentionsGet(parsed);
          return;
        case "set":
          await Commands.mentionsSet(parsed);
          return;
      }
      return;
    case "mode":
      switch (command[1]?.name) {
        case "get":
          await Commands.modeGet(parsed);
          return;
        case "set":
          await Commands.modeSet(parsed);
          return;
      }
      return;
    case "move":
      await Commands.move(parsed);
      return;
    case "next":
      await Commands.next(parsed);
      return;
    case "notifications":
      switch (command[1]?.name) {
        case "get":
          await Commands.notificationsGet(parsed);
          return;
        case "set":
          await Commands.notificationsSet(parsed);
          return;
      }
      return;
    case "permission":
      switch (command[1]?.name) {
        case "add":
          switch (command[2]?.name) {
            case "user":
              await Commands.permissionAdd(parsed, false);
              return;
            case "role":
              await Commands.permissionAdd(parsed, true);
              return;
          }
          return;
        case "delete":
          switch (command[2]?.name) {
            case "user":
              await Commands.permissionDelete(parsed, false);
              return;
            case "role":
              await Commands.permissionDelete(parsed, true);
              return;
          }
          return;
        case "list":
          await Commands.permissionList(parsed);
          return;
      }
      return;
    case "priority":
      switch (command[1]?.name) {
        case "add":
          switch (command[2]?.name) {
            case "user":
              await Commands.priorityAdd(parsed, false);
              return;
            case "role":
              await Commands.priorityAdd(parsed, true);
              return;
          }
          return;
        case "delete":
          switch (command[2]?.name) {
            case "user":
              await Commands.priorityDelete(parsed, false);
              return;
            case "role":
              await Commands.priorityDelete(parsed, true);
              return;
          }
          return;
        case "list":
          await Commands.priorityList(parsed);
          return;
      }
      return;
    case "pullnum":
      switch (command[1]?.name) {
        case "get":
          await Commands.pullnumGet(parsed);
          return;
        case "set":
          await Commands.pullnumSet(parsed);
          return;
      }
      return;
    case "queues":
      switch (command[1]?.name) {
        case "add":
          await Commands.queuesAdd(parsed);
          return;
        case "delete":
          await Commands.queuesDelete(parsed);
          return;
        case "list":
          await Commands.queuesList(parsed);
          return;
      }
      return;
    case "roles":
      switch (command[1]?.name) {
        case "get":
          await Commands.rolesGet(parsed);
          return;
        case "set":
          await Commands.rolesSet(parsed);
          return;
      }
      return;
    case "schedule":
      switch (command[1]?.name) {
        case "add":
          await Commands.scheduleAdd(parsed);
          return;
        case "delete":
          await Commands.scheduleDelete(parsed);
          return;
        case "help":
          await Commands.scheduleHelp(parsed);
          return;
        case "list":
          await Commands.scheduleList(parsed);
          return;
      }
      return;
    case "shuffle":
      await Commands.shuffle(parsed);
      return;
    case "size":
      switch (command[1]?.name) {
        case "get":
          await Commands.sizeGet(parsed);
          return;
        case "set":
          await Commands.sizeSet(parsed);
          return;
      }
      return;
    case "start":
      await Commands.start(parsed);
      return;
    case "timestamps":
      switch (command[1]?.name) {
        case "get":
          await Commands.timestampsGet(parsed);
          return;
        case "set":
          await Commands.timestampsSet(parsed);
          return;
      }
      return;
    case "to-me":
      await Commands.toMe(parsed);
      return;
    case "whitelist":
      switch (command[1]?.name) {
        case "add":
          switch (command[2]?.name) {
            case "user":
              await Commands.bwAdd(parsed, false, false);
              return;
            case "role":
              await Commands.bwAdd(parsed, true, false);
              return;
          }
          return;
        case "delete":
          switch (command[2]?.name) {
            case "user":
              await Commands.bwDelete(parsed, false, false);
              return;
            case "role":
              await Commands.bwDelete(parsed, true, false);
              return;
          }
          return;
        case "list":
          await Commands.bwList(parsed, false);
          return;
      }
      return;
  }
}

async function processVoice(oldVoiceState: VoiceState, newVoiceState: VoiceState) {
  try {
    if (!isReady) {
      return;
    }
    const oldVoiceChannel = oldVoiceState?.channel as VoiceChannel | StageChannel;
    const newVoiceChannel = newVoiceState?.channel as VoiceChannel | StageChannel;

    const member = newVoiceState.member || oldVoiceState.member;
    // Ignore mutes and deafens
    if (oldVoiceChannel === newVoiceChannel || !member) {
      return;
    }

    const storedGuild = await QueueGuildTable.get(member.guild.id);
    const storedOldQueueChannel = oldVoiceChannel ? await QueueTable.get(oldVoiceChannel.id) : undefined;
    const storedNewQueueChannel = newVoiceChannel ? await QueueTable.get(newVoiceChannel.id) : undefined;

    if (Base.isMe(member) && ((storedOldQueueChannel && storedNewQueueChannel) || !oldVoiceChannel || !newVoiceChannel)) {
      // Ignore when the bot moves between queues or when it starts and stops
      return;
    }
    if (storedNewQueueChannel && !Base.isMe(member)) {
      // Joined queue channel
      try {
        if (storedNewQueueChannel.target_channel_id) {
          const targetChannel = (await member.guild.channels.fetch(storedNewQueueChannel.target_channel_id).catch(() => null)) as
            | VoiceChannel
            | StageChannel;
          if (targetChannel) {
            if (
              storedNewQueueChannel.auto_fill &&
              newVoiceChannel.members.filter((member) => !member.user.bot).size === 1 &&
              (!targetChannel.userLimit || targetChannel.members.filter((member) => !member.user.bot).size < targetChannel.userLimit)
            ) {
              member.voice.setChannel(targetChannel).catch(() => null);
              return;
            }
          } else {
            // Target has been deleted - clean it up
            await QueueTable.setTarget(newVoiceChannel.id, Base.knex.raw("DEFAULT"));
          }
        }
        await QueueMemberTable.store(newVoiceChannel, member);
        await SchedulingUtils.scheduleDisplayUpdate(storedGuild, newVoiceChannel);

        await MessagingUtils.logToLoggingChannel("join", `${member} joined ${newVoiceChannel}.`, member, storedGuild, true);
      } catch (e: any) {
        // skip display update if failure
      }
    }
    if (storedOldQueueChannel) {
      try {
        // Left queue channel
        if (Base.isMe(member) && newVoiceChannel) {
          await QueueTable.setTarget(oldVoiceChannel.id, newVoiceChannel.id);
          // move bot back
          member.voice.setChannel(oldVoiceChannel).catch(() => null);
          await setTimeout(
            async () => await fillTargetChannel(storedOldQueueChannel, oldVoiceChannel, newVoiceChannel).catch(() => null),
            1000
          );
        } else {
          await QueueMemberTable.unstore(member.guild.id, oldVoiceChannel.id, [member.id], storedOldQueueChannel.grace_period);
          await SchedulingUtils.scheduleDisplayUpdate(storedGuild, oldVoiceChannel);

          await MessagingUtils.logToLoggingChannel("leave", `${member} left ${oldVoiceChannel}.`, member, storedGuild, true);
        }
      } catch (e: any) {
        // skip display update if failure
      }
    }
    if (!Base.isMe(member) && oldVoiceChannel) {
      // Check if leaving target channel
      const storedQueues = await QueueTable.getFromTarget(oldVoiceChannel.id);
      // Randomly pick a queue to pull from
      const storedQueue = storedQueues[~~(Math.random() * storedQueues.length)];
      if (storedQueue && storedQueue.auto_fill) {
        const queueChannel = member.guild.channels.cache.get(storedQueue.queue_channel_id) as VoiceChannel | StageChannel;
        if (queueChannel) {
          await fillTargetChannel(storedQueue, queueChannel, oldVoiceChannel);
        }
      }
    }
  } catch (e: any) {
    console.error(e);
  }
}

async function fillTargetChannel(
  storedSrcChannel: StoredQueue,
  srcChannel: VoiceChannel | StageChannel,
  dstChannel: VoiceChannel | StageChannel
) {
  const guild = srcChannel.guild;
  // Check to see if I have perms to drag other users into this channel.
  if (dstChannel.permissionsFor(guild.me).has("CONNECT")) {
    // Swap bot with nextQueueMember. If the destination has a user limit, swap and add enough users to fill the limit.
    let storedMembers = await QueueMemberTable.getFromQueueOrdered(srcChannel);
    if (storedMembers.length > 0) {
      if (!storedSrcChannel.auto_fill) {
        // If partial filling is disabled, and there aren't enough members, skip.
        if (!storedSrcChannel.enable_partial_pull && storedMembers.length < storedSrcChannel.pull_num) {
          const displayChannel = await DisplayChannelTable.getFirstChannelFromQueue(srcChannel.guild, srcChannel.id);
          await displayChannel?.send(
            `${srcChannel} only has **${storedMembers.length}** member${storedMembers.length > 1 ? "s" : ""}, **${
              storedSrcChannel.pull_num
            }** are needed. ` +
              `To allow pulling of fewer than **${storedSrcChannel.pull_num}** member${
                storedMembers.length > 1 ? "s" : ""
              }, use \`/pullnum\` and enable \`partial_pulling\`.`
          );
          return;
        }
        storedMembers = storedMembers.slice(0, storedSrcChannel.pull_num);
      }
      if (dstChannel.userLimit) {
        const number = Math.max(0, dstChannel.userLimit - dstChannel.members.filter((member) => !member.user.bot).size);
        storedMembers = storedMembers.slice(0, number);
      }
      const promises = [];
      for (const storedMember of storedMembers) {
        promises.push(
          QueueMemberTable.getMemberFromQueueMember(srcChannel, storedMember).then((m) => m?.voice.setChannel(dstChannel).catch(() => null))
        );
      }
      await Promise.all(promises);
    }
  } else {
    // Request perms in display channel chat
    const displayChannel = await DisplayChannelTable.getFirstChannelFromQueue(srcChannel.guild, srcChannel.id);
    if (displayChannel) {
      await displayChannel.send(`I need the **CONNECT** permission in the ${dstChannel} voice channel to pull in queue members.`);
    } else {
      const owner = await guild.fetchOwner();
      owner.send(`I need the **CONNECT** permission in the ${dstChannel} voice channel to pull in queue members.`).catch(() => null);
    }
  }
}

async function joinLeaveButton(interaction: ButtonInteraction) {
  try {
    const storedDisplay = await DisplayChannelTable.getFromMessage(interaction.message.id);
    if (!storedDisplay) {
      await interaction.reply("An error has occurred").catch(() => null);
      return;
    }
    let queueChannel = (await interaction.guild.channels.fetch(storedDisplay.queue_channel_id).catch(async (e) => {
      if (e.code === 50001) {
        await interaction
          .reply({
            content: `I can't see <#${storedDisplay.queue_channel_id}>. Please give me the \`View Channel\` permission.`,
          })
          .catch(() => null);
        return;
      } else {
        throw e;
      }
    })) as GuildBasedChannel;
    if (!queueChannel) {
      throw "Queue channel not found.";
    }
    const member = await queueChannel.guild.members.fetch(interaction.user.id);
    const storedQueueMember = await QueueMemberTable.get(queueChannel.id, member.id);
    if (storedQueueMember) {
      const storedQueue = await QueueTable.get(queueChannel.id);
      await QueueMemberTable.unstore(member.guild.id, queueChannel.id, [member.id], storedQueue.grace_period);
      await interaction.reply({ content: `You left ${queueChannel}.`, ephemeral: true }).catch(() => null);
    } else {
      await QueueMemberTable.store(queueChannel, member);
      await interaction.reply({ content: `You joined ${queueChannel}.`, ephemeral: true }).catch(() => null);
    }
    const storedGuild = await QueueGuildTable.get(interaction.guild.id);
    await SchedulingUtils.scheduleDisplayUpdate(storedGuild, queueChannel);

    await MessagingUtils.logToLoggingChannel(
      storedQueueMember ? "leave" : "join",
      `${member} ${storedQueueMember ? "left" : "joined"} ${queueChannel}.`,
      member,
      storedGuild,
      true
    );
  } catch (e: any) {
    if (e.author === "Queue Bot") {
      await interaction.reply({ content: "**ERROR**: " + e.message, ephemeral: true }).catch(() => null);
    } else {
      await interaction.reply("An error has occurred").catch(() => null);
    }
  }
}
