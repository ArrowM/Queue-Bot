import {
  CommandInteraction,
  CommandInteractionOption,
  GuildChannel,
  GuildMember,
  InteractionReplyOptions,
  Message,
  MessageEmbedOptions,
  MessageMentionOptions,
  Role,
  Snowflake,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import { Base } from "./Base";
import { QueueChannel, QueueGuild } from "./Interfaces";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { AdminPermissionTable } from "./tables/AdminPermissionTable";

export class ParsingUtils {
  private static regEx = RegExp(Base.config.permissionsRegexp, "i");
  /**
   * Determine whether user has permission to interact with bot
   */
  public static async checkPermission(request: CommandInteraction | Message): Promise<boolean> {
    try {
      const member = request.member as GuildMember;
      if (!member) return false;
      // Check if ADMIN
      if (
        member
          .permissionsIn(request.channel as TextChannel | VoiceChannel | StageChannel)
          .has("ADMINISTRATOR")
      )
        return true;
      // Check IDs
      const roleIds = Array.from(member.roles.cache.keys());
      for await (const entry of await AdminPermissionTable.getMany(request.guild.id)) {
        if (roleIds.includes(entry.role_member_id) || member.id === entry.role_member_id)
          return true;
      }
      // Check role names
      const roles = member.roles.cache.values();
      for await (const role of roles) {
        if (this.regEx.test(role.name)) return true;
      }
    } catch (e) {
      // Empty
    }
    // False if no matches
    return false;
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
  channel?: VoiceChannel | StageChannel | TextChannel;
  member?: GuildMember;
  role?: Role;
  text?: string;
  num?: number;
  rawStrings?: string[];
}

export interface ParsedOptions {
  hasChannel?: boolean;
  hasMember?: boolean;
  hasRole?: boolean;
  hasText?: boolean;
  hasNumber?: boolean;
  channelType?: ("GUILD_VOICE" | "GUILD_STAGE_VOICE" | "GUILD_TEXT")[];
  numberArgs?: {
    min: number;
    max: number;
    defaultValue: number;
  };
}

export class ParsedCommand {
  public request: CommandInteraction;
  public storedQueueChannels: QueueChannel[];
  public channels: (VoiceChannel | StageChannel | TextChannel)[];
  public queueGuild: QueueGuild;
  public hasPermission: boolean;
  public args: ParsedArguments;
  public missingArgs?: string[];

  constructor(command: CommandInteraction) {
    this.args = {};
    this.request = command;
  }

  /**
   * Return missing fields
   */
  public async readArgs(conf = {} as ParsedOptions): Promise<string[]> {
    if (this.missingArgs === undefined) {
      this.missingArgs = [];
    } else {
      return this.missingArgs;
    }
    this.args.rawStrings = this.findArgs(this.request.options.data, "STRING") as string[];
    this.args.text = this.args.rawStrings[0];

    // Required - channel, role, member
    if (conf.hasChannel) {
      this.storedQueueChannels = await this.getStoredQueueChannels();
      const channels = await this.getChannels();
      await this.populateChannelParam(channels, conf.channelType);
      if (!this.args.channel) {
        const queues: (VoiceChannel | StageChannel | TextChannel)[] = [];
        for await (const storedQueueChannel of this.storedQueueChannels) {
          const queueChannel = (await this.request.guild.channels
            .fetch(storedQueueChannel.queue_channel_id)
            .catch(() => null)) as VoiceChannel | StageChannel | TextChannel;
          if (!queueChannel) continue; // No channel
          if (conf.channelType && !conf.channelType.includes(queueChannel.type)) continue; // Wrong type
          queues.push(queueChannel);
        }
        if (queues.length === 1) this.args.channel = queues[0];
      }
      if (!this.args.channel?.guild?.id) {
        const channelText =
          (conf.channelType?.includes("GUILD_TEXT") ? "**text** " : "") +
          (conf.channelType?.includes("GUILD_VOICE") ||
          conf.channelType?.includes("GUILD_STAGE_VOICE")
            ? "**voice** "
            : "") +
          "channel";
        this.missingArgs.push(channelText);
      }
    }
    if (conf.hasRole) {
      this.args.role = this.findArgs(this.request.options.data, "ROLE")[0] as Role;
      if (!this.args.role) this.missingArgs.push("role");
    }
    if (conf.hasMember) {
      this.args.member = this.findArgs(this.request.options.data, "USER")[0] as GuildMember;
      if (!this.args.member) this.missingArgs.push("member");
    }
    // OPTIONAL - number & text
    if (conf.numberArgs) {
      this.args.num = this.findArgs(this.request.options.data, "INTEGER")[0] as number;
      this.verifyNumber(conf.numberArgs.min, conf.numberArgs.max, conf.numberArgs.defaultValue);
    }
    if (conf.hasNumber && this.args.num === undefined) this.missingArgs.push("number");

    if (conf.hasText && !this.args.text) this.missingArgs.push("message");
    // Report missing
    if (this.missingArgs.length) {
      await this.reply({
        content:
          "**ERROR**: Missing " +
          this.missingArgs.join(" and ") +
          " argument" +
          (this.missingArgs.length > 1 ? "s" : "") +
          ".",
        commandDisplay: "EPHEMERAL",
      }).catch(() => null);
    }

    return this.missingArgs;
  }

  public async getStoredQueueChannels() {
    if (this.storedQueueChannels === undefined) {
      this.storedQueueChannels = await QueueChannelTable.getFromGuild(this.request.guild.id);
    }
    return this.storedQueueChannels;
  }

  public async getChannels() {
    if (this.channels === undefined) {
      this.channels = Array.from(
        (await this.request.guild.channels.fetch())
          .filter((ch) => ["GUILD_VOICE", "GUILD_STAGE_VOICE", "GUILD_TEXT"].includes(ch.type))
          .values()
      ) as (VoiceChannel | StageChannel | TextChannel)[]; // Pre-fetch all channels
    }
    return this.channels;
  }

  public async setup(): Promise<void> {
    this.queueGuild = await QueueGuildTable.get(this.request.guild.id);
    if (!this.queueGuild) {
      await QueueGuildTable.store(this.request.guild);
      this.queueGuild = await QueueGuildTable.get(this.request.guild.id);
    }
    this.hasPermission = await ParsingUtils.checkPermission(this.request);
  }

  public async reply(options: ReplyOptions): Promise<Message> {
    const mentions: MessageMentionOptions = options.allowMentions ? null : { parse: [] };
    const isEphemeral = options.commandDisplay === "EPHEMERAL";
    const message: InteractionReplyOptions = {
      allowedMentions: mentions,
      content: options.content,
      embeds: options.embeds,
      ephemeral: isEphemeral,
      fetchReply: !isEphemeral,
    };
    if (this.request.replied) {
      return (await this.request.followUp(message)) as Message;
    } else if (this.request.deferred) {
      return (await this.request.editReply(message)) as Message;
    } else {
      return (await this.request.reply(message)) as unknown as Message;
    }
  }

  public async edit(options: ReplyOptions): Promise<Message> {
    return (await this.request.editReply(options)) as Message;
  }

  public async deferReply(): Promise<void> {
    await this.request.deferReply();
  }

  private findArgs(
    _options: Readonly<CommandInteractionOption[]>,
    type: string,
    accumulator: any[] = []
  ): any[] {
    for (const option of _options) {
      if (
        (option.type === "SUB_COMMAND" || option.type === "SUB_COMMAND_GROUP") &&
        option.options?.length
      ) {
        accumulator = this.findArgs(option.options, type, accumulator);
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

  protected async populateChannelParam(
    channels: (VoiceChannel | StageChannel | TextChannel)[],
    channelType: string[]
  ): Promise<void> {
    let channel = this.findArgs(this.request.options.data, "CHANNEL")[0] as GuildChannel;
    if (!channel) {
      const channelId = this.args.text as Snowflake;
      if (channelId) {
        channel = (await this.getChannels()).find((ch) => ch.id === channelId);
        if (channel) {
          this.args.text = this.args.rawStrings[1];
        }
      }
    }
    if (
      channel?.type &&
      ((channelType && !channelType.includes(channel.type)) ||
        !["GUILD_VOICE", "GUILD_STAGE_VOICE", "GUILD_TEXT"].includes(channel.type))
    ) {
      channel = null;
    }
    this.args.channel = channel as VoiceChannel | StageChannel | TextChannel;
  }

  protected verifyNumber(min: number, max: number, defaultValue: number): void {
    if (this.args.num) {
      this.args.num = Math.max(Math.min(this.args.num as number, max), min);
    } else {
      this.args.num = defaultValue;
    }
  }
}
