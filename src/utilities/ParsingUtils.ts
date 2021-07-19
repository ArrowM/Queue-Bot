import {
   Collection,
   CommandInteraction,
   CommandInteractionOption,
   GuildChannel,
   GuildMember,
   Message,
   MessageEmbedOptions,
   MessageMentionOptions,
   Role,
   Snowflake,
   TextChannel,
   VoiceChannel,
} from "discord.js";
import { Base } from "./Base";
import { QueueChannel, QueueGuild } from "./Interfaces";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { AdminPermissionTable } from "./tables/AdminPermissionTable";

export class ParsingUtils {
   private static regEx = RegExp(Base.getConfig().permissionsRegexp, "i");
   /**
    * Determine whether user has permission to interact with bot
    */
   public static async checkPermission(req: CommandInteraction | Message): Promise<boolean> {
      const member = req.member as GuildMember;
      // Check if ADMIN
      if (member.permissionsIn(req.channel as TextChannel | VoiceChannel).has("ADMINISTRATOR")) return true;
      // Check IDs
      const roleIds = member.roles.cache.keyArray();
      for await (const entry of await AdminPermissionTable.getMany(req.guild.id)) {
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
    */
   public static async getStoredQueue(
      parsed: ParsedCommand | ParsedMessage,
      type?: "GUILD_TEXT" | "GUILD_VOICE"
   ): Promise<VoiceChannel | TextChannel> {
      const storedChannels = await QueueChannelTable.fetchFromGuild(parsed.request.guild);
      if (storedChannels.length === 1) return storedChannels[0];

      const channelParam = parsed.args.channel;
      if (!channelParam) return null;

      let result = storedChannels.find((storedChannel) => storedChannel.id === channelParam.id);
      if (result) {
         if (type && type !== result.type) {
            await parsed
               .reply({
                  content: `**ERROR**: Expected a ${type} channel.\`${channelParam.name}\` is a ${channelParam.type} channel.`,
                  commandDisplay: "EPHEMERAL",
               })
               .catch(() => null);
            result = null;
         }
      } else {
         await parsed
            .reply({
               content:
                  `**ERROR**: \`${channelParam.name}\` is not a queue. ` +
                  (parsed.hasPermission ? `Use \`/queues add ${channelParam.name}\` to make it a queue.` : ""),
               commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
      }
      return result;
   }

   public static async reportMissingArgs(parsed: ParsedCommand | ParsedMessage, missingArgs: string[]): Promise<void> {
      await parsed
         .reply({
            content: "**ERROR**: Missing " + missingArgs.join(" and ") + " argument" + (missingArgs.length > 1 ? "s" : "") + ".",
            commandDisplay: "EPHEMERAL",
         })
         .catch(() => null);
   }
}

export interface ReplyOptions {
   messageDisplay?: "NONE" | "DM";
   commandDisplay?: "EPHEMERAL";
   content?: string;
   embeds?: MessageEmbedOptions[];
   allowMentions?: boolean;
}

export interface ParsedArguments {
   channel?: VoiceChannel | TextChannel;
   member?: GuildMember;
   role?: Role;
   text?: string;
   num?: number;
}

export interface ParsedOptions {
   commandNameLength: number;
   hasChannel?: boolean;
   hasMember?: boolean;
   hasRole?: boolean;
   hasText?: boolean;
   hasNumber?: boolean;
   channelType?: "GUILD_VOICE" | "GUILD_TEXT";
   numberArgs?: {
      min: number;
      max: number;
      defaultValue: number;
   };
}

export abstract class Parsed {
   public request: CommandInteraction | Message;
   public queueChannels: QueueChannel[];
   public queueGuild: QueueGuild;
   public hasPermission: boolean;
   public args: ParsedArguments;
   public missingArgs?: string[];

   constructor() {
      this.args = {};
   }
   // noinspection JSUnusedLocalSymbols
   public abstract reply(_options: ReplyOptions): Promise<Message>;

   /**
    * Return missing fields
    */
   public async readArgs(conf: ParsedOptions): Promise<string[]> {
      if (this.missingArgs === undefined) {
         this.missingArgs = [];
      } else {
         return this.missingArgs;
      }

      await this.getStringParam(conf.commandNameLength); // must call before getChannelParam()

      if (conf.hasChannel) {
         this.queueChannels = await this.getStoredQueueChannels();
         await this.getChannelParam(conf.channelType);
         if (!this.args.channel && this.queueChannels.length === 1) {
            this.args.channel = await this.request.guild.channels.fetch(this.queueChannels[0]?.queue_channel_id).catch(() => null);
         }
         if (!this.args.channel) this.missingArgs.push("channel");
      }
      if (conf.hasNumber) {
         await this.getNumberParam();
         this.verifyNumber(conf.numberArgs.min, conf.numberArgs.max, conf.numberArgs.defaultValue);
         if (!this.args.num) this.missingArgs.push("number");
      }
      if (conf.hasRole) {
         await this.getRoleParam();
         if (!this.args.role) this.missingArgs.push("role");
      }
      if (conf.hasMember) {
         await this.getMemberParam();
         if (!this.args.member) this.missingArgs.push("member");
      }
      if (conf.hasText && !this.args.text) {
         this.missingArgs.push("message");
      }

      if (this.missingArgs.length) {
         await this.reply({
            content: "**ERROR**: Missing " + this.missingArgs.join(" and ") + " argument" + (this.missingArgs.length > 1 ? "s" : "") + ".",
            commandDisplay: "EPHEMERAL",
         }).catch(() => null);
      }

      return this.missingArgs;
   }

   public async getStoredQueueChannels() {
      if (this.queueChannels === undefined) {
         this.queueChannels = await QueueChannelTable.getFromGuild(this.request.guild.id);
      }
      return this.queueChannels;
   }

   public async setup(): Promise<void> {
      this.queueGuild = await QueueGuildTable.get(this.request.guild.id);
      if (!this.queueGuild) {
         await QueueGuildTable.store(this.request.guild);
         this.queueGuild = await QueueGuildTable.get(this.request.guild.id);
      }
      this.hasPermission = await ParsingUtils.checkPermission(this.request);
   }
   
   protected abstract getStringParam(_commandNameLength: number): Promise<void>;
   protected abstract getChannelParam(_channelType: "GUILD_VOICE" | "GUILD_TEXT"): Promise<void>;
   protected abstract getRoleParam(): Promise<void>;
   protected abstract getMemberParam(): Promise<void>;
   protected abstract getNumberParam(): Promise<void>;

   protected verifyNumber(min: number, max: number, defaultValue: number): void {
      if (this.args.num) {
         this.args.num = Math.max(Math.min(this.args.num as number, max), min);
      } else {
         this.args.num = defaultValue;
      }
   }
}

export class ParsedCommand extends Parsed {
   public request: CommandInteraction;

   constructor(command: CommandInteraction) {
      super();
      this.request = command;
   }

   public async reply(options: ReplyOptions): Promise<Message> {
      const mentions: MessageMentionOptions = options.allowMentions ? { users: [], roles: [] } : null;
      const message = {
         content: options.content,
         embeds: options.embeds,
         mention: mentions,
         ephemeral: options.commandDisplay === "EPHEMERAL",
      };
      if (this.request.replied) {
         return (await this.request.followUp(message)) as Message;
      } else if (this.request.deferred) {
         return (await this.request.editReply(message)) as Message;
      } else {
         await this.request.reply(message);
      }
   }

   private findArgs(options: Collection<string, CommandInteractionOption>, type: string, accumulator: any[]): any[] {
      for (const option of options.values()) {
         if ((option.type === "SUB_COMMAND" || option.type === "SUB_COMMAND_GROUP") && option.options) {
            accumulator.push(...this.findArgs(option.options, type, accumulator));
         } else if (option.type === type) {
            if (["CHANNEL"].includes(type)) {
               accumulator.push(option.channel);
            } else if (["USER"].includes(type)) {
               accumulator.push(option.member);
            } else if (["ROLE"].includes(type)) {
               accumulator.push(option.role);
            } else {
               accumulator.push(option.value);
            }
         }
      }
      return accumulator;
   }

   protected async getChannelParam(channelType: string): Promise<void> {
      let channel = this.findArgs(this.request.options, "CHANNEL", [])[0] as GuildChannel;
      if (channel && ((channelType && channelType !== channel.type) || !["GUILD_VOICE", "GUILD_TEXT"].includes(channel.type))) {
         this.request.reply({ content: `**ERROR**: \`${channel.name}\` is an invalid channel`, ephemeral: true }).catch(() => null);
         channel = null;
      }
      if (!channel) {
         const id = this.findArgs(this.request.options, "STRING", [])[0] as Snowflake;
         channel = await this.request.guild.channels.fetch(id);
      }
      this.args.channel = channel as TextChannel | VoiceChannel;
   }

   protected async getMemberParam(): Promise<void> {
      this.args.member = this.findArgs(this.request.options, "USER", [])[0] as GuildMember;
   }

   protected async getRoleParam(): Promise<void> {
      this.args.role = this.findArgs(this.request.options, "ROLE", [])[0] as Role;
   }

   protected async getStringParam(): Promise<void> {
      const texts = this.findArgs(this.request.options, "STRING", []) as string[];
      this.args.text = texts[texts.length - 1] as string;
   }

   protected async getNumberParam(): Promise<void> {
      this.args.num = this.findArgs(this.request.options, "INTEGER", [])[0] as number;
   }
}

export class ParsedMessage extends Parsed {
   public request: Message;

   constructor(message: Message) {
      super();
      this.request = message;
   }

   public async reply(options: ReplyOptions): Promise<Message> {
      const mentions: MessageMentionOptions = options.allowMentions ? { users: [], roles: [] } : null;
      const message = {
         content: options.content,
         embeds: options.embeds,
         mention: mentions,
      };
      if (options.messageDisplay === "DM") {
         return (await this.request.author.send(message)) as Message;
      } else if (options.messageDisplay !== "NONE") {
         return (await this.request.reply(message)) as Message;
      }
   }

   private static coll = new Intl.Collator("en", { sensitivity: "base" });
   // Populate this.args.text as well
   protected async getChannelParam(channelType: "GUILD_VOICE" | "GUILD_TEXT"): Promise<void> {
      if (this.request.mentions.channels.first()) {
         this.args.channel = this.request.mentions.channels.first() as VoiceChannel | TextChannel;
         this.args.text = this.args.text.replace(`<#${this.args.channel.id}>`, "").trim();
      } else {
         let channels = (await this.request.guild.channels.fetch()).array() as (VoiceChannel | TextChannel)[];

         channels = channels.filter((ch) => (channelType ? ch.type === channelType : ["GUILD_VOICE", "GUILD_TEXT"].includes(ch.type)));

         let channelName = this.args.text;
         // Search for largest matching channel name
         while (channelName) {
            for (const channel of channels) {
               if (ParsedMessage.coll.compare(channelName, channel.name) === 0) {
                  this.args.channel = channel;
                  this.args.text = this.args.text.substring(channelName.length + 1);
                  break;
               }
            }
            if (this.args.channel) break;
            channelName = channelName.substring(0, channelName.lastIndexOf(" "));
         }
      }
   }

   protected async getMemberParam(): Promise<void> {
      this.args.member = (await this.request.mentions.members).first();
      if (this.args.member) {
         this.args.text = this.args.text.replace(`<#${this.args.member.id}>`, "").trim();
      }
   }

   protected async getRoleParam(): Promise<void> {
      this.args.role = (await this.request.mentions.roles).first();
      if (this.args.role) {
         this.args.text = this.args.text.replace(`<#${this.args.role.id}>`, "").trim();
      }
   }

   protected async getStringParam(commandNameLength: number): Promise<void> {
      this.args.text = this.request.content.substring(commandNameLength + 2).trim(); // +2 for slash and space
   }

   protected async getNumberParam(): Promise<void> {
      this.args.num = +this.args.text.replace(/\D/g, "");
   }
}
