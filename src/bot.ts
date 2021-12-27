import { AutoPoster } from "topgg-autoposter";
import {
  ButtonInteraction,
  GuildMember,
  Interaction,
  PartialGuildMember,
  StageChannel,
  TextChannel,
  VoiceChannel,
  VoiceState,
} from "discord.js";
import { EventEmitter } from "events";
import { QueueChannel } from "./utilities/Interfaces";
import { Base } from "./utilities/Base";
import { DisplayChannelTable } from "./utilities/tables/DisplayChannelTable";
import { QueueChannelTable } from "./utilities/tables/QueueChannelTable";
import { QueueGuildTable } from "./utilities/tables/QueueGuildTable";
import { QueueMemberTable } from "./utilities/tables/QueueMemberTable";
import util from "util";
import { BlackWhiteListTable } from "./utilities/tables/BlackWhiteListTable";
import { AdminPermissionTable } from "./utilities/tables/AdminPermissionTable";
import { ParsedCommand } from "./utilities/ParsingUtils";
import { PriorityTable } from "./utilities/tables/PriorityTable";
import { PatchingUtils } from "./utilities/PatchingUtils";
import { SlashCommands } from "./utilities/SlashCommands";
import { Commands } from "./Commands";
import { MessagingUtils } from "./utilities/MessagingUtils";

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
    `Caught exception:\n${util.inspect(err, { depth: null })}\nException origin:\n${util.inspect(
      origin,
      {
        depth: null,
      }
    )}`
  );
});
// client.on("rateLimit", (rateLimitInfo) => {
//   console.error(`Rate limit error:\n${util.inspect(rateLimitInfo, { depth: null })}`);
// });

// Top GG integration
if (config.topGgToken) AutoPoster(config.topGgToken, client);

//
// --- DISCORD EVENTS ---
//

interface CommandArg {
  key: string;
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
        await processCommand(parsed);
      }
    }
  } catch (e) {
    console.error(e);
  }
});

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once("ready", async () => {
  const guilds = Array.from(Base.client.guilds.cache?.values());
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
  MessagingUtils.startScheduler();
  console.timeEnd("READY. Bot started in");
  isReady = true;
});

client.on("guildCreate", async (guild) => {
  if (!isReady) return;
  await QueueGuildTable.store(guild).catch(() => null);
});

client.on("roleDelete", async (role) => {
  try {
    if (!isReady) return;
    if (await PriorityTable.get(role.guild.id, role.id)) {
      await PriorityTable.unstore(role.guild.id, role.id);
      const queueGuild = await QueueGuildTable.get(role.guild.id);
      const queueChannels = await QueueChannelTable.fetchFromGuild(role.guild);
      for (const queueChannel of queueChannels) {
        MessagingUtils.updateDisplay(queueGuild, queueChannel);
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
      const queueChannel = (await member.guild.channels
        .fetch(queueMember.channel_id)
        .catch(() => null)) as VoiceChannel | StageChannel | TextChannel;
      MessagingUtils.updateDisplay(queueGuild, queueChannel);
    }
  } catch (e) {
    // Nothing
  }
}

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
      await QueueChannelTable.unstore(
        deletedQueueChannel.guild_id,
        deletedQueueChannel.queue_channel_id
      );
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
      MessagingUtils.updateDisplay(queueGuild, newChannel);
    }
  } catch (e) {
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

async function checkPermission(parsed: ParsedCommand): Promise<boolean> {
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

async function processCommand(parsed: ParsedCommand) {
  // Process command into key/value pairs
  const command: CommandArg[] = [{ key: parsed.request.commandName, value: undefined }];
  let obj = parsed.request.options?.data;
  while (obj) {
    command.push({ key: obj?.[0]?.name, value: obj?.[0]?.value });
    obj = obj?.[0]?.options;
  }
  switch (command[0]?.key) {
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
      await Commands.myqueues(parsed);
      return;
  }

  if (!(await checkPermission(parsed))) return;
  // -- ADMIN COMMANDS --
  switch (command[0]?.key) {
    case "autopull":
      switch (command[1]?.key) {
        case "get":
          await Commands.autopullGet(parsed);
          return;
        case "set":
          await Commands.autopullSet(parsed);
          return;
      }
      return;
    case "blacklist":
      switch (command[1]?.key) {
        case "add":
          switch (command[2]?.key) {
            case "user":
              await Commands.bwAdd(parsed, false, true);
              return;
            case "role":
              await Commands.bwAdd(parsed, true, true);
              return;
          }
          return;
        case "delete":
          switch (command[2]?.key) {
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
        case "clear":
          await Commands.bwClear(parsed, true);
          return;
      }
      return;
    case "button":
      switch (command[1]?.key) {
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
      switch (command[1]?.key) {
        case "get":
          await Commands.colorGet(parsed);
          return;
        case "set":
          await Commands.colorSet(parsed);
          return;
      }
      return;
    case "display":
      await Commands.display(parsed);
      return;
    case "enqueue":
      switch (command[1]?.key) {
        case "user":
          await Commands.enqueueUser(parsed);
          return;
        case "role":
          await Commands.enqueueRole(parsed);
          return;
      }
      return;
    case "graceperiod":
      switch (command[1]?.key) {
        case "get":
          await Commands.graceperiodGet(parsed);
          return;
        case "set":
          await Commands.graceperiodSet(parsed);
          return;
      }
      return;
    case "header":
      switch (command[1]?.key) {
        case "get":
          await Commands.headerGet(parsed);
          return;
        case "set":
          await Commands.headerSet(parsed);
          return;
      }
      return;
    case "kick":
      await Commands.kick(parsed);
      return;
    case "kickall":
      await Commands.kickAll(parsed);
      return;
    case "lock":
      switch (command[1]?.key) {
        case "get":
          await Commands.lockGet(parsed);
          return;
        case "set":
          await Commands.lockSet(parsed);
          return;
      }
      return;
    case "mentions":
      switch (command[1]?.key) {
        case "get":
          await Commands.mentionsGet(parsed);
          return;
        case "set":
          await Commands.mentionsSet(parsed);
          return;
      }
      return;
    case "mode":
      switch (command[1]?.key) {
        case "get":
          await Commands.modeGet(parsed);
          return;
        case "set":
          await Commands.modeSet(parsed);
          return;
      }
      return;
    case "next":
      await Commands.next(parsed);
      return;
    case "permission":
      switch (command[1]?.key) {
        case "add":
          switch (command[2]?.key) {
            case "user":
              await Commands.permissionAddUser(parsed);
              return;
            case "role":
              await Commands.permissionAddRole(parsed);
              return;
          }
          return;
        case "delete":
          switch (command[2]?.key) {
            case "user":
              await Commands.permissionDeleteUser(parsed);
              return;
            case "role":
              await Commands.permissionDeleteRole(parsed);
              return;
          }
          return;
        case "list":
          await Commands.permissionList(parsed);
          return;
        case "clear":
          await Commands.permissionClear(parsed);
          return;
      }
      return;
    case "priority":
      switch (command[1]?.key) {
        case "add":
          switch (command[2]?.key) {
            case "user":
              await Commands.priorityAddUser(parsed);
              return;
            case "role":
              await Commands.priorityAddRole(parsed);
              return;
          }
          return;
        case "delete":
          switch (command[2]?.key) {
            case "user":
              await Commands.priorityDeleteUser(parsed);
              return;
            case "role":
              await Commands.priorityDeleteRole(parsed);
              return;
          }
          return;
        case "list":
          await Commands.priorityList(parsed);
          return;
        case "clear":
          await Commands.priorityClear(parsed);
          return;
      }
      return;
    case "pullnum":
      switch (command[1]?.key) {
        case "get":
          await Commands.pullnumGet(parsed);
          return;
        case "set":
          await Commands.pullnumSet(parsed);
          return;
      }
      return;
    case "queues":
      switch (command[1]?.key) {
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
      switch (command[1]?.key) {
        case "get":
          await Commands.rolesGet(parsed);
          return;
        case "set":
          await Commands.rolesSet(parsed);
          return;
      }
      return;
    case "shuffle":
      await Commands.shuffle(parsed);
      return;
    case "size":
      switch (command[1]?.key) {
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
    case "to-me":
      await Commands.toMe(parsed);
      return;
    case "whitelist":
      switch (command[1]?.key) {
        case "add":
          switch (command[2]?.key) {
            case "user":
              await Commands.bwAdd(parsed, false, false);
              return;
            case "role":
              await Commands.bwAdd(parsed, true, false);
              return;
          }
          return;
        case "delete":
          switch (command[2]?.key) {
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
        case "clear":
          await Commands.bwClear(parsed, false);
          return;
      }
      return;
  }
}

async function processVoice(oldVoiceState: VoiceState, newVoiceState: VoiceState) {
  try {
    if (!isReady) return;
    const oldVoiceChannel = oldVoiceState?.channel as VoiceChannel | StageChannel;
    const newVoiceChannel = newVoiceState?.channel as VoiceChannel | StageChannel;

    const member = newVoiceState.member || oldVoiceState.member;
    // Ignore mutes and deafens
    if (oldVoiceChannel === newVoiceChannel || !member) return;

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
      try {
        if (storedNewQueueChannel.target_channel_id) {
          const targetChannel = (await member.guild.channels
            .fetch(storedNewQueueChannel.target_channel_id)
            .catch(() => null)) as VoiceChannel | StageChannel;
          if (targetChannel) {
            if (
              storedNewQueueChannel.auto_fill &&
              newVoiceChannel.members.filter((member) => !member.user.bot).size === 1 &&
              (!targetChannel.userLimit ||
                targetChannel.members.filter((member) => !member.user.bot).size <
                  targetChannel.userLimit)
            ) {
              member.voice.setChannel(targetChannel).catch(() => null);
              return;
            }
          } else {
            // Target has been deleted - clean it up
            await QueueChannelTable.setTarget(newVoiceChannel.id, knex.raw("DEFAULT"));
          }
        }
        await QueueMemberTable.store(newVoiceChannel, member);
        MessagingUtils.updateDisplay(queueGuild, newVoiceChannel);
      } catch (e) {
        // skip display update if failure
      }
    }
    if (storedOldQueueChannel) {
      try {
        // Left queue channel
        if (Base.isMe(member) && newVoiceChannel) {
          await QueueChannelTable.setTarget(oldVoiceChannel.id, newVoiceChannel.id);
          // move bot back
          member.voice.setChannel(oldVoiceChannel).catch(() => null);
          await setTimeout(
            async () =>
              await fillTargetChannel(
                storedOldQueueChannel,
                oldVoiceChannel,
                newVoiceChannel
              ).catch(() => null),
            1000
          );
        } else {
          await QueueMemberTable.unstore(
            member.guild.id,
            oldVoiceChannel.id,
            [member.id],
            storedOldQueueChannel.grace_period
          );
          MessagingUtils.updateDisplay(queueGuild, oldVoiceChannel);
        }
      } catch (e) {
        // skip display update if failure
      }
    }
    if (!Base.isMe(member) && oldVoiceChannel) {
      // Check if leaving target channel
      const storedQueueChannels = await QueueChannelTable.getFromTarget(oldVoiceChannel.id);
      // Randomly pick a queue to pull from
      const storedQueueChannel =
        storedQueueChannels[~~(Math.random() * storedQueueChannels.length)];
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
}

async function fillTargetChannel(
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
        const queueMember = await QueueMemberTable.getMemberFromQueueMember(
          srcChannel,
          storedMember
        );
        if (!queueMember) continue;
        queueMember.voice.setChannel(dstChannel).catch(() => null);
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
    if (!storedDisplayChannel) {
      await interaction.reply("An error has occurred").catch(() => null);
      return;
    }
    let queueChannel = (await interaction.guild.channels
      .fetch(storedDisplayChannel.queue_channel_id)
      .catch(async (e) => {
        if (e.code === 50001) {
          await interaction
            .reply({
              content: `I can't see <#${storedDisplayChannel.queue_channel_id}>. Please give me the \`View Channel\` permission.`,
            })
            .catch(() => null);
          return;
        } else {
          throw e;
        }
      })) as VoiceChannel | StageChannel | TextChannel;
    if (!queueChannel) throw "Queue channel not found.";
    const member = await queueChannel.guild.members.fetch(interaction.user.id);
    const storedQueueMember = await QueueMemberTable.get(queueChannel.id, member.id);
    if (storedQueueMember) {
      const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
      await QueueMemberTable.unstore(
        member.guild.id,
        queueChannel.id,
        [member.id],
        storedQueueChannel.grace_period
      );
      await interaction
        .reply({ content: `You left \`${queueChannel.name}\`.`, ephemeral: true })
        .catch(() => null);
    } else {
      await QueueMemberTable.store(queueChannel, member);
      await interaction
        .reply({ content: `You joined \`${queueChannel.name}\`.`, ephemeral: true })
        .catch(() => null);
    }
    const queueGuild = await QueueGuildTable.get(interaction.guild.id);
    MessagingUtils.updateDisplay(queueGuild, queueChannel);
  } catch (e: any) {
    if (e.author === "Queue Bot") {
      await interaction
        .reply({ content: "**ERROR**: " + e.message, ephemeral: true })
        .catch(() => null);
    } else {
      await interaction.reply("An error has occurred").catch(() => null);
      console.error(e);
    }
  }
}
