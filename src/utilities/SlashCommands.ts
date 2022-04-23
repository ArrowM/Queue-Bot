import delay from "delay";
import {
  ApplicationCommand,
  ApplicationCommandOption,
  ApplicationCommandOptionChoice,
  ApplicationOptions,
  Client as SlashClient,
} from "discord-slash-commands-client";
import { Collection, Guild, GuildBasedChannel, Message, Snowflake } from "discord.js";
import { Base } from "./Base";
import { QueueTable } from "./tables/QueueTable";
import { Parsed } from "./Interfaces";

interface SlashUpdateMessage {
  resp: Message;
  respText: string;
  progNum: number;
  totalNum: number;
}
export class SlashCommands {
  public static readonly GLOBAL_COMMANDS = ["altprefix", "help", "queues", "permission"];
  public static readonly MULTI_QUEUE_COMMANDS = [
    "autopull",
    "blacklist",
    "button",
    "clear",
    "color",
    "display",
    "header",
    "dequeue",
    "leave",
    "lock",
    "pullnum",
    "schedule",
    "shuffle",
    "to-me",
    "whitelist",
  ];
  public static readonly TEXT_COMMANDS = ["button"];
  public static readonly VOICE_COMMANDS = ["autopull", "start", "to-me"];
  public static readonly slashClient = new SlashClient(Base.config.token, Base.config.clientId);

  private static readonly commandRegistrationCache = new Map<Snowflake, number>();

  private static async editProgress(suMsg: SlashUpdateMessage) {
    await suMsg.resp
      ?.edit(suMsg.respText + "\n[" + "▓".repeat(++suMsg.progNum) + "░".repeat(suMsg.totalNum - suMsg.progNum) + "]")
      .catch(() => null);
    await delay(5000);
  }

  private static modifyQueueArg(cmd: ApplicationOptions, queueChannels: GuildBasedChannel[]): ApplicationOptions {
    if (cmd.options) {
      cmd.options = this.modifyQueue(cmd.name, cmd.options, queueChannels);
    }
    return cmd;
  }

  private static modifyQueue(
    name: string,
    options: ApplicationCommandOption[],
    queueChannels: GuildBasedChannel[]
  ): ApplicationCommandOption[] {
    for (let i = options.length - 1; i >= 0; i--) {
      const option = options[i];
      if (option.type === 1 || option.type === 2) {
        if (option.options?.length) {
          option.options = this.modifyQueue(name, option.options, queueChannels);
        }
      } else if (option.type === 7) {
        if (this.TEXT_COMMANDS.includes(name)) {
          queueChannels = queueChannels.filter((ch) => ch.type === "GUILD_TEXT");
        } else if (this.VOICE_COMMANDS.includes(name)) {
          queueChannels = queueChannels.filter((ch) => ["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(ch.type));
        }
        if (queueChannels.length > 1) {
          const choices: ApplicationCommandOptionChoice[] = queueChannels.map((ch) => {
            return { name: ch.name, value: ch.id };
          });
          if (this.MULTI_QUEUE_COMMANDS.includes(name)) {
            choices.push({ name: "ALL", value: "ALL" });
          }
          // Modify
          options[i] = {
            name: option.name,
            description: option.description,
            type: 3,
            required: option.required,
            choices: choices,
          };
        } else {
          options.splice(i, 1);
        }
      }
    }
    return options;
  }

  private static async modify(
    guildId: Snowflake,
    parsed: Parsed,
    queueChannels: GuildBasedChannel[]
  ): Promise<ApplicationOptions[]> {
    const now = Date.now();
    this.commandRegistrationCache.set(guildId, now);

    let commands = JSON.parse(JSON.stringify(Base.commands)) as ApplicationOptions[]; // copies
    commands = commands.filter((c) => !this.GLOBAL_COMMANDS.includes(c.name));

    // Send progress message
    const msgTest = "Registering queue commands. This will take about 2 minutes...";
    const slashUpdateMessage = {
      resp: await parsed?.reply({ content: msgTest }).catch(() => null as Message),
      respText: msgTest,
      progNum: 0,
      totalNum: commands.length,
    };

    if (!queueChannels.find((ch) => ch.type === "GUILD_TEXT")) {
      const excludedTextCommands = this.TEXT_COMMANDS;
      commands = commands.filter((c) => !excludedTextCommands.includes(c.name));

      let liveCommands = (await this.slashClient
        .getCommands({ guildID: guildId })
        .catch(() => [])) as ApplicationCommand[];
      liveCommands = liveCommands.filter((cmd) => cmd.application_id === Base.client.user.id);

      for (const excludedTextCommand of excludedTextCommands) {
        if (this.commandRegistrationCache.get(guildId) !== now) {
          slashUpdateMessage.resp?.delete().catch(() => null);
          return;
        }
        const liveCommand = liveCommands.find((cmd) => cmd.name === excludedTextCommand);
        if (liveCommand) {
          await this.slashClient.deleteCommand(liveCommand.id, guildId).catch(console.error);
        }
        await this.editProgress(slashUpdateMessage);
      }
    }

    for (let command of commands) {
      // Register remaining commands
      if (this.commandRegistrationCache.get(guildId) !== now) {
        slashUpdateMessage.resp?.delete().catch(() => null);
        return;
      }

      let modddedCommand = await this.modifyQueueArg(command, queueChannels);
      await this.slashClient.createCommand(modddedCommand, guildId).catch(() => null);

      await this.editProgress(slashUpdateMessage);
    }
    await slashUpdateMessage.resp?.edit({ content: "Done registering queue commands." }).catch(() => null);
  }

  private static async modifyForNoQueues(guildId: Snowflake, parsed: Parsed) {
    const now = Date.now();
    this.commandRegistrationCache.set(guildId, now);

    const commands = (await this.slashClient.getCommands({ guildID: guildId }).catch(() => [])) as ApplicationCommand[];
    const filteredCommands = commands.filter(
      (cmd) => !this.GLOBAL_COMMANDS.includes(cmd.name) && cmd.application_id === Base.client.user.id
    );

    const msgTest = "Unregistering queue commands. This will take about 2 minutes...";
    const slashUpdateMessage = {
      resp: await parsed?.reply({ content: msgTest }).catch(() => null as Message),
      respText: msgTest,
      progNum: 0,
      totalNum: commands.length,
    };

    for (let command of filteredCommands) {
      if (this.commandRegistrationCache.get(guildId) !== now) {
        slashUpdateMessage.resp?.delete().catch(() => null);
        return;
      }

      await this.slashClient.deleteCommand(command.id, guildId).catch(() => null);

      await this.editProgress(slashUpdateMessage);
    }
    await slashUpdateMessage.resp?.edit({ content: "Done unregistering queue commands." }).catch(() => null);
  }

  public static async addCommandForGuild(guild: Guild, cmd: ApplicationOptions) {
    cmd = JSON.parse(JSON.stringify(cmd)) as ApplicationOptions; // copies
    const queueChannels = [...(await QueueTable.fetchFromGuild(guild)).values()].slice(0, 25); // max # of options is 25
    if (queueChannels.length) {
      cmd = await this.modifyQueueArg(cmd, queueChannels);
      await SlashCommands.slashClient.createCommand(cmd, guild.id).catch(() => null);
    }
  }

  public static async modifyCommandsForGuild(guild: Guild, parsed?: Parsed) {
    try {
      //console.log("Modifying commands for " + guild.id);
      const queueChannels = [...(await QueueTable.fetchFromGuild(guild)).values()].slice(0, 25); // max # of options is 25
      if (queueChannels.length === 0) {
        await this.modifyForNoQueues(guild.id, parsed);
      } else {
        await this.modify(guild.id, parsed, queueChannels);
      }
    } catch (e: any) {
      console.error(e);
    }
  }

  public static async updateCommandsForOfflineGuildChanges(guilds: Collection<Snowflake, Guild>) {
    for await (const guild of guilds.values()) {
      const channels = guild.channels.cache?.filter((ch) =>
        ["GUILD_VOICE", "GUILD_STAGE_VOICE", "GUILD_TEXT"].includes(ch?.type)
      );
      const queueChannels = await QueueTable.getFromGuild(guild.id);
      let updateRequired = false;
      for await (const storedChannel of queueChannels) {
        if (!channels.some((ch) => ch.id === storedChannel.queue_channel_id)) {
          await QueueTable.unstore(guild.id, storedChannel.queue_channel_id);
          updateRequired = true;
        }
      }
      if (updateRequired) {
        this.modifyCommandsForGuild(guild).then();
        await delay(6000);
      }
    }
    console.log("Done updating commands for offline guild changes.");
  }

  public static async registerGlobalCommands() {
    // Cleanup
    let liveCommands = (await this.slashClient.getCommands({})) as ApplicationCommand[];
    liveCommands = liveCommands.filter((cmd) => cmd.application_id === Base.client.user.id);
    for await (const command of liveCommands) {
      if (!this.GLOBAL_COMMANDS.includes(command.name)) {
        await this.slashClient.deleteCommand(command.id);
        await delay(5000);
      }
    }
    // Register globals
    for await (const name of this.GLOBAL_COMMANDS) {
      const command = Base.commands.find((cmd) => cmd.name === name);
      await this.slashClient.createCommand(command).catch(() => null);
      await delay(5000);
    }
  }

  public static async register(guild: Collection<Snowflake, Guild>) {
    this.registerGlobalCommands().then();
    this.updateCommandsForOfflineGuildChanges(guild).then();
  }
}
