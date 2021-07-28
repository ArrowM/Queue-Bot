import delay from "delay";
import {
   ApplicationCommand,
   ApplicationCommandOption,
   ApplicationCommandOptionChoice,
   ApplicationOptions,
   Client as SlashClient,
} from "discord-slash-commands-client";
import { Guild, Message, Snowflake, TextChannel, VoiceChannel } from "discord.js";
import { Base } from "./Base";
import { Parsed } from "./ParsingUtils";
import { QueueChannelTable } from "./tables/QueueChannelTable";

export interface SlashUpdateMessage {
   resp: Message;
   respText: string;
   progNum: number;
   totalNum: number;
}

export class SlashCommands {
   private static slashClient = new SlashClient(Base.config.token, Base.config.clientId);
   private static commandRegistrationCache = new Map<string, number>();

   private static async editProgress(suMsg: SlashUpdateMessage): Promise<void> {
      await suMsg.resp
         ?.edit(suMsg.respText + "\n[" + "▓".repeat(++suMsg.progNum) + "░".repeat(suMsg.totalNum - suMsg.progNum) + "]")
         .catch(() => null);
      await delay(5000);
   }

   private static removeQueueArg(cmd: ApplicationOptions): ApplicationOptions {
      if (cmd.options) cmd.options = this.removeQueue(cmd.options);
      return cmd;
   }

   private static removeQueue(options: ApplicationCommandOption[]): ApplicationCommandOption[] {
      for (let i = options.length - 1; i >= 0; i--) {
         const option = options[i];
         if ((option.type === 1 || option.type === 2) && option.options) {
            option.options = this.removeQueue(option.options);
         } else if (option.type === 7) {
            // Remove
            options.splice(i, 1);
         }
      }
      return options;
   }

   private static modifyQueueArg(cmd: ApplicationOptions, storedChannels: (VoiceChannel | TextChannel)[]): ApplicationOptions {
      if (cmd.options) cmd.options = this.modifyQueue(cmd.options, storedChannels);
      return cmd;
   }

   private static modifyQueue(
      options: ApplicationCommandOption[],
      storedChannels: (VoiceChannel | TextChannel)[]
   ): ApplicationCommandOption[] {
      for (let i = options.length - 1; i >= 0; i--) {
         const option = options[i];
         if (option.type === 1 || option.type === 2) {
            if (option.options?.length) {
               option.options = this.modifyQueue(option.options, storedChannels);
            }
         } else if (option.type === 7) {
            if (option.description.toLowerCase().includes("text queue")) {
               storedChannels = storedChannels.filter((ch) => ch.type === "GUILD_TEXT");
            } else if (option.description.toLowerCase().includes("voice queue")) {
               storedChannels = storedChannels.filter((ch) => ch.type === "GUILD_VOICE");
            }
            const choices: ApplicationCommandOptionChoice[] = storedChannels.map((ch) => {
               return { name: ch.name, value: ch.id };
            });
            // Modify
            options[i] = {
               name: option.name,
               description: option.description,
               type: 3,
               required: option.required,
               choices: choices,
            };
         }
      }
      return options;
   }

   private static async modify(
      guildId: Snowflake,
      parsed: Parsed,
      storedChannels: (VoiceChannel | TextChannel)[]
   ): Promise<ApplicationOptions[]> {
      const now = Date.now();
      this.commandRegistrationCache.set(guildId, now);

      let commands = JSON.parse(JSON.stringify(Base.commands)) as ApplicationOptions[];
      commands = commands.filter((c) => !["altprefix", "help", "queues"].includes(c.name));

      // Send progress message
      const msgTest = "Registering queue commands. This will take about 2 minutes...";
      const slashUpdateMessage = {
         resp: await parsed?.reply({ content: msgTest }).catch(() => null as Message),
         respText: msgTest,
         progNum: 0,
         totalNum: commands.length,
      };

      if (!storedChannels.find((ch) => ch.type === "GUILD_TEXT")) {
         // Delete text queue exclusive commands
         const excludedTextCommands = ["button", "enqueue", "join", "leave"];
         commands = commands.filter((c) => !excludedTextCommands.includes(c.name));

         let liveCommands = (await this.slashClient.getCommands({ guildID: guildId }).catch(() => [])) as ApplicationCommand[];
         liveCommands = liveCommands.filter((cmd) => cmd.application_id === Base.client.user.id);
         for await (const excludedTextCommand of excludedTextCommands) {
            if (this.commandRegistrationCache.get(guildId) !== now) {
               slashUpdateMessage.resp?.delete().catch(() => null);
               return;
            }
            const liveCommand = liveCommands.find((cmd) => cmd.name === excludedTextCommand);
            if (liveCommand) await this.slashClient.deleteCommand(liveCommand.id, guildId).catch(console.error);

            await this.editProgress(slashUpdateMessage);
         }
      }

      for await (let command of commands) {
         // Register remaining commands
         if (this.commandRegistrationCache.get(guildId) !== now) {
            slashUpdateMessage.resp?.delete().catch(() => null);
            return;
         }

         if (storedChannels.length === 1) {
            command = await this.removeQueueArg(command);
         } else {
            command = await this.modifyQueueArg(command, storedChannels);
         }
         await this.slashClient.createCommand(command, guildId).catch(() => null);

         await this.editProgress(slashUpdateMessage);
      }
      await slashUpdateMessage.resp?.edit({ content: "Done registering queue commands." }).catch(() => null);
   }

   private static async modifyForNoQueues(guildId: Snowflake, parsed: Parsed): Promise<void> {
      const now = Date.now();
      this.commandRegistrationCache.set(guildId, now);

      const msgTest = "Unregistering queue commands. This will take about 2 minutes...";
      const slashUpdateMessage = {
         resp: await parsed?.reply({ content: msgTest }).catch(() => null as Message),
         respText: msgTest,
         progNum: 0,
         totalNum: 0,
      };

      const commands = (await this.slashClient.getCommands({ guildID: guildId }).catch(() => [])) as ApplicationCommand[];
      const filteredCommands = commands.filter(
         (cmd) => !["altprefix", "help", "queues"].includes(cmd.name) && cmd.application_id === Base.client.user.id
      );

      for await (let command of filteredCommands) {
         if (this.commandRegistrationCache.get(guildId) !== now) {
            slashUpdateMessage.resp?.delete().catch(() => null);
            return;
         }

         await this.slashClient.deleteCommand(command.id, guildId).catch(() => null);

         await this.editProgress(slashUpdateMessage);
      }
      await slashUpdateMessage.resp?.edit({ content: "Done unregistering queue commands." }).catch(() => null);
   }

   public static async modifyCommandsForGuild(guild: Guild, parsed?: Parsed): Promise<void> {
      try {
         console.log("Modifying commands for " + guild.id);
         const storedChannels = await QueueChannelTable.fetchFromGuild(guild);
         if (storedChannels.length === 0) {
            await this.modifyForNoQueues(guild.id, parsed);
         } else {
            await this.modify(guild.id, parsed, storedChannels);
         }
      } catch (e) {
         console.error(e);
      }
   }

   public static async modifySlashCommandsForAllGuilds() {
      for await (const guild of Base.client.guilds.cache.array()) {
         this.modifyCommandsForGuild(guild);
         await delay(6000);
      }
      console.log("Done modifying commands.");
   }

   public static async registerGlobalCommands() {
      let liveCommands = (await this.slashClient.getCommands({})) as ApplicationCommand[];
      liveCommands = liveCommands.filter((cmd) => cmd.application_id === Base.client.user.id);
      for await (const name of ["altprefix", "help", "queues"]) {
         if (!liveCommands.some((cmd) => cmd.name === name)) {
            const command = Base.commands.find((cmd) => cmd.name === name);
            await this.slashClient.createCommand(command).catch(console.error);
            console.log("Registered global commands: " + command.name);
            await delay(5000);
         }
      }
      for await (const command of liveCommands) {
         if (!["altprefix", "help", "queues"].includes(command.name)) {
            await this.slashClient.deleteCommand(command.id);
         }
         await delay(5000);
      }
   }
}
