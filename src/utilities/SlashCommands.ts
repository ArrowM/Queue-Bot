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

export class SlashCommands {
   private static slashClient = new SlashClient(Base.config.token, Base.config.clientId);
   private static commandRegistrationCache = new Map<string, number>();

   private static async editProgress(msg: Message, respText: string, progNum: number, TotalNum: number): Promise<void> {
      await msg?.edit(respText + "\n[" + "▓".repeat(progNum) + "░".repeat(TotalNum - progNum) + "]").catch(() => null);
   }

   private static removeQueueArg(cmd: ApplicationOptions): ApplicationOptions {
      if (cmd.options) cmd.options = this.removeQueue(cmd.options);
      return cmd;
   }

   private static removeQueue(options: ApplicationCommandOption[]): ApplicationCommandOption[] {
      for (let i = 0; i < options.length; i++) {
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
      for (let i = 0; i < options.length; i++) {
         const option = options[i];
         if (option.type === 1 || option.type === 2) {
            if (option.options?.length) {
               option.options = this.modifyQueue(option.options, storedChannels);
            }
         } else if (option.type === 7) {
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

   private static async modifyForNoQueues(guildId: Snowflake, parsed?: Parsed): Promise<void> {
      const now = Date.now();
      this.commandRegistrationCache.set(guildId, now);
      let count = 0;
      const respText = "Unregistering queue commands. This will take about 2 minutes...";
      const resp = await parsed?.reply({ content: respText }).catch(() => null as Message);

      let commands = (await this.slashClient.getCommands({ guildID: guildId }).catch(() => [])) as ApplicationCommand[];
      commands = commands.filter((c) => !["altprefix", "help", "queues"].includes(c.name));
      for await (let command of commands) {
         if (this.commandRegistrationCache.get(guildId) !== now) {
            resp?.delete().catch(() => null);
            return;
         }

         await this.slashClient.deleteCommand(command.id, guildId).catch(() => null);

         this.editProgress(resp, respText, ++count, commands.length);
         await delay(5000);
      }
      await resp?.edit({ content: "Done unregistering queue commands." }).catch(() => null);
   }

   private static async modifyForOneQueue(guildId: Snowflake, parsed?: Parsed): Promise<void> {
      const now = Date.now();
      this.commandRegistrationCache.set(guildId, now);
      let count = 0;
      const respText = "Registering queue commands. This will take about 2 minutes...";
      const resp = await parsed?.reply({ content: respText }).catch(() => null as Message);

      // Deepclone this object because it is being modified.
      let commands = JSON.parse(JSON.stringify(Base.commands)) as ApplicationOptions[];
      commands = commands.filter((c) => !["altprefix", "help", "queues"].includes(c.name));

      for await (let command of commands) {
         if (this.commandRegistrationCache.get(guildId) !== now) {
            resp?.delete().catch(() => null);
            return;
         }

         command = await this.removeQueueArg(command);
         await this.slashClient.createCommand(command, guildId).catch(() => null);

         this.editProgress(resp, respText, ++count, commands.length);
         await delay(5000);
      }
      await resp?.edit({ content: "Done registering queue commands." }).catch(() => null);
   }

   private static async modifyForManyQueues(guildId: Snowflake, storedChannels: (VoiceChannel | TextChannel)[], parsed?: Parsed) {
      const now = Date.now();
      this.commandRegistrationCache.set(guildId, now);
      let count = 0;
      const respText = "Registering queue commands. This will take about 2 minutes...";
      const resp = await parsed?.reply({ content: respText }).catch(() => null as Message);

      // Deepclone this object because it is being modified.
      let commands = JSON.parse(JSON.stringify(Base.commands)) as ApplicationOptions[];
      commands = commands.filter((c) => !["altprefix", "help", "queues"].includes(c.name));
      for await (let command of commands) {
         if (this.commandRegistrationCache.get(guildId) !== now) {
            resp?.delete().catch(() => null);
            return;
         }

         command = await this.modifyQueueArg(command, storedChannels);
         await this.slashClient.createCommand(command, guildId).catch(() => null);

         this.editProgress(resp, respText, ++count, commands.length);
         await delay(5000);
      }
      await resp?.edit({ content: "Done registering queue commands." }).catch(() => null);
   }

   public static async modifyCommandsForGuild(guild: Guild, parsed?: Parsed): Promise<void> {
      const storedChannels = await QueueChannelTable.fetchFromGuild(guild);
      if (storedChannels.length === 0) {
         await this.modifyForNoQueues(guild.id, parsed);
      } else if (storedChannels.length === 1) {
         await this.modifyForOneQueue(guild.id, parsed);
      } else if (storedChannels.length === 2 && parsed.queueChannels.length === 1) {
         await this.modifyForManyQueues(guild.id, storedChannels, parsed);
      }
   }

   public static async modifySlashCommandsForAllGuilds() {
      if (((await this.slashClient.getCommands({})) as ApplicationCommand[]).length < 10) return;
      for await (const guild of Base.client.guilds.cache.array()) {
         this.modifyCommandsForGuild(guild);
         await delay(6000);
      }
   }

   public static async registerGlobalCommands() {
      const commands = (await this.slashClient.getCommands({})) as ApplicationCommand[];
      for await (const name of ["altprefix", "help", "queues"]) {
         if (!commands.some((cmd) => cmd.name === name)) {
            const command = Base.commands.find((cmd) => cmd.name === name);
            await this.slashClient.createCommand(command).catch(console.error);
            console.log("Registered global commands: " + command.name);
            await delay(5000);
         }
      }
      for await (const command of commands) {
         if (!["altprefix", "help", "queues"].includes(command.name)) {
            await this.slashClient.deleteCommand(command.id);
         }
         await delay(5000);
      }
   }
}
