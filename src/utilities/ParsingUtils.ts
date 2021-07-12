import {
   Collection,
   CommandInteraction,
   CommandInteractionOption,
   GuildChannel,
   GuildMember,
   Role,
   TextChannel,
   VoiceChannel,
} from "discord.js";
import { Base } from "./Base";
import { QueueGuild } from "./Interfaces";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { AdminPermissionTable } from "./tables/AdminPermissionTable";

export class ParsingUtils {
   private static regEx = RegExp(Base.getConfig().permissionsRegexp, "i");
   /**
    * Determine whether user has permission to interact with bot
    * @param CommandInteraction
    */
   public static async checkPermission(command: CommandInteraction): Promise<boolean> {
      const member = command.member as GuildMember;
      // Check if ADMIN
      if (member.permissionsIn(command.channel as TextChannel | VoiceChannel).has("ADMINISTRATOR")) return true;
      // Check IDs
      const roleIds = member.roles.cache.keyArray();
      for await (const entry of await AdminPermissionTable.getMany(command.guild.id)) {
         if (roleIds.includes(entry.role_member_id) || member.id === entry.role_member_id) return true;
      }
      // Check role names
      const roles = member.roles.cache.array();
      for await (const role of roles) {
         if (this.regEx.test(role.name)) return true;
      }
      // False if no matches
      return false;
   }

   /**
    * Get a queue using user argument
    * @param command
    * @param type? Type of channels to fetch ('GUILD_TEXT' or 'GUILD_VOICE')
    */
   public static async getStoredQueue(parsed: Parsed, type?: "GUILD_TEXT" | "GUILD_VOICE"): Promise<VoiceChannel | TextChannel> {
      const storedChannels = await QueueChannelTable.fetchFromGuild(parsed.command.guild);
      const channelParam = parsed.getChannelParam();
      if (!channelParam) return null;

      let result = storedChannels.find((storedChannel) => storedChannel.id === channelParam.id);
      if (result) {
         if (type && type !== result.type) {
            await parsed.command.reply({
               content: `**ERROR**: Expected a ${type} channel. \`${channelParam.name}\` is a ${channelParam.type} channel.`,
               ephemeral: true,
            }).catch(() => null);
            result = null;
         }
      } else {
         await parsed.command.reply({
            content:
               `**ERROR**: \`${channelParam.name}\` is not a queue. ` +
               (parsed.hasPermission ? `Use \`/queues add ${channelParam.name}\` to make it a queue.` : ""),
            ephemeral: true,
         }).catch(() => null);
      }
      return result;
   }
}

export class Parsed {
   public command: CommandInteraction;
   public queueGuild: QueueGuild;
   public hasPermission: boolean;

   constructor(command: CommandInteraction) {
      this.command = command;
   }

   public async setup(): Promise<void> {
      this.queueGuild = await QueueGuildTable.get(this.command.guild.id);
      if (!this.queueGuild) {
         await QueueGuildTable.store(this.command.guild);
         this.queueGuild = await QueueGuildTable.get(this.command.guild.id);
      }
      this.hasPermission = await ParsingUtils.checkPermission(this.command);
   }

   private findOption(options: Collection<string, CommandInteractionOption>, type: string): CommandInteractionOption {
      for (const option of options.values()) {
         if (option.type === "SUB_COMMAND" || option.type === "SUB_COMMAND_GROUP") {
            return this.findOption(option.options, type);
         } else if (option.type === type) {
            return option;
         }
      }
      return null;
   }

   public getChannelParam(): TextChannel | VoiceChannel {
      const channel = this.findOption(this.command.options, "CHANNEL")?.channel as GuildChannel;
      if (channel?.type === "GUILD_CATEGORY") {
         this.command.reply({ content: `**ERROR**: \`${channel.name}\` is an invalid channel`, ephemeral: true }).catch(() => null);
      } else {
         return channel as TextChannel | VoiceChannel;
      }
   }

   public getMemberParam(): GuildMember {
      return this.findOption(this.command.options, "USER")?.member as GuildMember;
   }

   public getRoleParam(): Role {
      return this.findOption(this.command.options, "ROLE")?.role as Role;
   }

   public getStringParam(): string {
      return this.findOption(this.command.options, "STRING")?.value as string;
   }

   public getNumberParam(min: number, max: number): number {
      return Math.max(Math.min(this.findOption(this.command.options, "INTEGER")?.value as number, max), min);
   }
}
