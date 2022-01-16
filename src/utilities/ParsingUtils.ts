import {
  CommandInteraction,
  CommandInteractionOption,
  GuildChannel,
  GuildMember,
  InteractionReplyOptions,
  Message,
  MessageEmbedOptions,
  MessageMentionOptions,
  ReplyMessageOptions,
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
      const permissionEntries = await AdminPermissionTable.getMany(request.guild.id);
      for (const entry of permissionEntries) {
        if (roleIds.includes(entry.role_member_id) || member.id === entry.role_member_id)
          return true;
      }
      // Check role names
      const roles = member.roles.cache.values();
      for (const role of roles) {
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
  commandNameLength: number;
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

export abstract class Parsed {
  public request: CommandInteraction | Message;
  public storedQueueChannels: QueueChannel[];
  public channels: (VoiceChannel | StageChannel | TextChannel)[];
  public queueGuild: QueueGuild;
  public hasPermission: boolean;
  public args: ParsedArguments;
  public missingArgs?: string[];

  protected constructor() {
    this.args = {};
  }
  // eslint-disable-next-line no-unused-vars
  public abstract reply(_options: ReplyOptions): Promise<Message>;
  // eslint-disable-next-line no-unused-vars
  public abstract edit(_options: ReplyOptions): Promise<Message>;
  public abstract deferReply(): Promise<void>;

  /**
   * Return missing fields
   */
  public async readArgs(conf: ParsedOptions): Promise<string[]> {
    if (this.missingArgs === undefined) {
      this.missingArgs = [];
    } else {
      return this.missingArgs;
    }

    await this.getStringParam(conf.commandNameLength); // must call before channel or number

    // Required - channel, role, member
    if (conf.hasChannel) {
      this.storedQueueChannels = await this.getStoredQueueChannels();
      const channels = await this.getChannels();
      await this.populateChannelParam(channels, conf.channelType);
      if (!this.args.channel) {
        const promises = [];
        for (const storedQueueChannel of this.storedQueueChannels) {
          promises.push(
            this.request.guild.channels.fetch(storedQueueChannel.queue_channel_id).catch(() => null)
          );
        }
        const queues = await Promise.all(promises);
        queues.filter((ch) => ch && conf.channelType && conf.channelType.includes(ch.type));
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
      await this.getRoleParam();
      if (!this.args.role) this.missingArgs.push("role");
    }
    if (conf.hasMember) {
      await this.getMemberParam();
      if (!this.args.member) this.missingArgs.push("member");
    }
    // OPTIONAL - number & text
    if (conf.numberArgs) {
      await this.getNumberParam();
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

  public async setup() {
    this.queueGuild = await QueueGuildTable.get(this.request.guild.id);
    if (!this.queueGuild) {
      await QueueGuildTable.store(this.request.guild);
      this.queueGuild = await QueueGuildTable.get(this.request.guild.id);
    }
    this.hasPermission = await ParsingUtils.checkPermission(this.request);
  }

  // eslint-disable-next-line no-unused-vars
  protected abstract getStringParam(_commandNameLength: number): Promise<void>;
  protected abstract populateChannelParam(
  // eslint-disable-next-line no-unused-vars
    _channels: (VoiceChannel | StageChannel | TextChannel)[],
    // eslint-disable-next-line no-unused-vars
    _channelType: ("GUILD_VOICE" | "GUILD_STAGE_VOICE" | "GUILD_TEXT")[]
  ): Promise<void>;
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

  public async deferReply() {
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
  ) {
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

  protected async getMemberParam() {
    this.args.member = this.findArgs(this.request.options.data, "USER")[0] as GuildMember;
  }

  protected async getRoleParam() {
    this.args.role = this.findArgs(this.request.options.data, "ROLE")[0] as Role;
  }

  protected async getStringParam() {
    this.args.rawStrings = this.findArgs(this.request.options.data, "STRING") as string[];
    this.args.text = this.args.rawStrings[0];
  }

  protected async getNumberParam() {
    this.args.num = this.findArgs(this.request.options.data, "INTEGER")[0] as number;
  }
}

export class ParsedMessage extends Parsed {
  public request: Message;
  private lastResponse: Message;

  constructor(message: Message) {
    super();
    this.request = message;
  }

  public async reply(options: ReplyOptions): Promise<Message> {
    const mentions: MessageMentionOptions = options.allowMentions ? null : { parse: [] };
    const message: ReplyMessageOptions = {
      content: options.content,
      embeds: options.embeds,
      allowedMentions: mentions,
    };
    if (options.messageDisplay === "DM") {
      return (this.lastResponse = (await this.request.author.send(message)) as Message);
    } else if (options.messageDisplay !== "NONE") {
      return (this.lastResponse = (await this.request.reply(message)) as Message);
    }
  }

  public async edit(options: ReplyOptions): Promise<Message> {
    if (this.lastResponse && this.lastResponse.editable) {
      return (await this.lastResponse.edit(options)) as Message;
    } else {
      return await this.reply(options);
    }
  }

  public async deferReply() {
    this.lastResponse = await this.request.reply("Thinking...");
  }

  private static coll = new Intl.Collator("en", { sensitivity: "base" });
  // Populate this.args.text as well
  protected async populateChannelParam(
    channels: (VoiceChannel | StageChannel | TextChannel)[],
    channelType: string[]
  ) {
    if (this.request.mentions.channels.first()) {
      this.args.channel = this.request.mentions.channels.first() as
        | VoiceChannel
        | StageChannel
        | TextChannel;
      this.args.text = this.args.text.replace(`<#${this.args.channel.id}>`, "").trim();
    } else {
      if (channelType) {
        channels = channels.filter((ch) => channelType.includes(ch.type));
      }
      let channelName = this.args.text;
      // Search for largest matching channel name
      while (channelName) {
        for (const channel of channels.values()) {
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

  protected async getMemberParam() {
    this.args.member = (await this.request.mentions.members).first();
    if (this.args.member) {
      this.args.text = this.args.text.replace(`<#${this.args.member.id}>`, "").trim();
    }
  }

  protected async getRoleParam() {
    this.args.role = (await this.request.mentions.roles).first();
    if (this.args.role) {
      this.args.text = this.args.text.replace(`<#${this.args.role.id}>`, "").trim();
    }
  }

  protected async getStringParam(commandNameLength: number) {
    this.args.text = this.request.content.substring(commandNameLength + 2).trim(); // +2 for slash and space
  }

  protected async getNumberParam() {
    this.args.num = +this.args.text.replace(/\D/g, "");
  }
}
