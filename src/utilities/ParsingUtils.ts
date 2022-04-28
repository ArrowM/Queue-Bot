/* eslint-disable no-unused-vars */
import {
  Collection,
  CommandInteraction,
  CommandInteractionOption,
  GuildBasedChannel,
  GuildMember,
  InteractionReplyOptions,
  Message,
  MessageEmbedOptions,
  MessageMentionOptions,
  ReplyMessageOptions,
  Role,
  Snowflake,
} from "discord.js";
import { Base } from "./Base";
import { StoredQueue, StoredGuild, QueuePair } from "./Interfaces";
import { QueueTable } from "./tables/QueueTable";
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
      if (!member) {
        return false;
      }
      // Check if ADMIN
      if (member.permissionsIn(request.channel as GuildBasedChannel).has("ADMINISTRATOR")) {
        return true;
      }
      // Check IDs
      const permissionEntries = await AdminPermissionTable.getMany(request.guild.id);
      for (const entry of permissionEntries) {
        if (member.roles.cache.has(entry.role_member_id) || member.id === entry.role_member_id) {
          return true;
        }
      }
      // Check role names
      const roles = member.roles.cache.values();
      for (const role of roles) {
        if (this.regEx.test(role.name)) {
          return true;
        }
      }
    } catch (e: any) {
      // Empty
    }
    // False if no matches
    return false;
  }
}

interface ReplyOptions {
  messageDisplay?: "NONE" | "DM";
  commandDisplay?: "EPHEMERAL";
  content?: string;
  embeds?: MessageEmbedOptions[];
  allowMentions?: boolean;
}

export enum RequiredType {
  REQUIRED = "REQUIRED",
  OPTIONAL = "OPTIONAL",
}

interface RequiredOptions {
  commandNameLength: number;

  channel?: {
    required?: RequiredType; // OPTIONAL means "All" queues are an accepted channel arg
    type?: ("GUILD_VOICE" | "GUILD_STAGE_VOICE" | "GUILD_TEXT")[];
  };
  members?: RequiredType;
  roles?: RequiredType;
  strings?: RequiredType;
  numbers?: {
    required?: RequiredType;
    min: number;
    max: number;
    defaultValue: number;
  };
}

abstract class ParsedBase {
  public args: {
    channels?: GuildBasedChannel[];
    members?: Collection<Snowflake, GuildMember>;
    roles?: Collection<Snowflake, Role>;
    strings: string[];
    numbers: number[];
  };
  public request: CommandInteraction | Message;
  public storedGuild: StoredGuild;
  public hasPermission: boolean;
  protected cachedChannels: Collection<string, GuildBasedChannel>;
  protected cachedQueues: StoredQueue[];
  protected cachedQueueChannels: QueuePair[];

  protected constructor() {
    this.args = {
      strings: [],
      numbers: [],
    };
  }

  public get member(): GuildMember {
    return this.args.members ? [...this.args.members.values()][0] : undefined;
  }

  public get role(): Role {
    return this.args.roles ? [...this.args.roles.values()][0] : undefined;
  }

  public get channel(): GuildBasedChannel {
    return this.args.channels?.[0];
  }

  public get channelNames(): string {
    return this.args.channels?.map((c) => "`" + c.name + "`").join(", ");
  }

  public get string(): string {
    return this.args.strings?.[0];
  }

  public get number(): number {
    return this.args.numbers?.[0];
  }

  public async setup() {
    this.storedGuild = await QueueGuildTable.get(this.request.guild.id);
    if (!this.storedGuild) {
      await QueueGuildTable.store(this.request.guild);
      this.storedGuild = await QueueGuildTable.get(this.request.guild.id);
    }
    this.hasPermission = await ParsingUtils.checkPermission(this.request);
  }

  public abstract parseArgs(conf: RequiredOptions): Promise<string[]>;
  public abstract reply(options: ReplyOptions): Promise<Message>;
  public abstract edit(options: ReplyOptions): Promise<Message>;

  protected async verifyArgs(conf: RequiredOptions): Promise<string[]> {
    const missingArgs = [];
    if (conf.channel?.required === RequiredType.REQUIRED && !this.args.channels) {
      missingArgs.push(
        (conf.channel.type?.includes("GUILD_TEXT") ? "**text** " : "") +
          (conf.channel.type?.includes("GUILD_VOICE") || conf.channel.type?.includes("GUILD_STAGE_VOICE")
            ? "**voice** "
            : "") +
          "channel"
      );
    }
    if (conf.roles === RequiredType.REQUIRED && !this.args.roles) {
      missingArgs.push("role");
    }
    if (conf.members === RequiredType.REQUIRED && !this.args.members?.size) {
      missingArgs.push("member");
    }
    if (conf.numbers?.required === RequiredType.REQUIRED) {
      if (this.args.numbers.length) {
        this.verifyNumber(conf.numbers.min, conf.numbers.max, conf.numbers.defaultValue);
      } else {
        missingArgs.push("number");
      }
    }
    if (conf.strings === RequiredType.REQUIRED && !this.args.strings.length) {
      missingArgs.push("message");
    }
    // Report missing
    if (missingArgs.length) {
      await this.reply({
        content:
          "**ERROR**: Missing " + missingArgs.join(" and ") + " argument" + (missingArgs.length > 1 ? "s." : "."),
        commandDisplay: "EPHEMERAL",
      }).catch(() => null);
    }
    return missingArgs;
  }

  /**
   * Get stored queues as StoredQueue[]
   */
  private async getStoredQueues(): Promise<StoredQueue[]> {
    if (this.cachedQueues === undefined) {
      this.cachedQueues = await QueueTable.getFromGuild(this.request.guild.id);
    }
    return this.cachedQueues;
  }

  public async getQueueChannels(): Promise<GuildBasedChannel[]> {
    return (await this.getQueuePairs()).map((pair) => pair.channel);
  }

  /**
   * Get queues as QueuePair[]
   */
  public async getQueuePairs(): Promise<QueuePair[]> {
    const storedQueues = await this.getStoredQueues();
    const channels = await this.getChannels();
    if (!this.cachedQueueChannels) {
      this.cachedQueueChannels = storedQueues.map((stored) => ({
        stored: stored,
        channel: channels.find((ch) => ch.id === stored.queue_channel_id),
      }));
    }
    return this.cachedQueueChannels;
  }

  /**
   * Get all channels as GuildBasedChannel
   */
  public async getChannels(): Promise<Collection<string, GuildBasedChannel>> {
    return (this.cachedChannels =
      this.cachedChannels ||
      (await this.request.guild.channels.fetch()).filter((ch) =>
        ["GUILD_VOICE", "GUILD_STAGE_VOICE", "GUILD_TEXT"].includes(ch.type)
      ));
  }

  protected verifyNumber(min: number, max: number, defaultValue: number): void {
    for (let i = 0; i < this.args.numbers.length; i++) {
      let number = this.args.numbers[i];
      this.args.numbers[i] = number ? Math.max(Math.min(number as number, max), min) : defaultValue;
    }
  }
}

export class ParsedCommand extends ParsedBase {
  public request: CommandInteraction;

  constructor(command: CommandInteraction) {
    super();
    this.request = command;
  }

  public async parseArgs(conf: RequiredOptions): Promise<string[]> {
    // Strings
    this.args.strings = this.findArgs(this.request.options.data, "STRING") as string[];
    // Numbers
    if (conf.numbers) {
      this.args.numbers = this.findArgs(this.request.options.data, "INTEGER") as number[];
    }
    // Members
    if (conf.members) {
      this.args.members = new Collection<Snowflake, GuildMember>();
      const members = this.findArgs(this.request.options.data, "USER") as GuildMember[];
      members.forEach((member) => this.args.members.set(member.id, member));
    }
    // Roles
    if (conf.roles) {
      this.args.roles = new Collection<Snowflake, Role>();
      const roles = this.findArgs(this.request.options.data, "ROLE") as Role[];
      roles.forEach((role) => this.args.roles.set(role.id, role));
    }
    // Channels
    if (conf.channel) {
      let channel = this.findArgs(this.request.options.data, "CHANNEL")[0] as GuildBasedChannel;
      if (channel && ["GUILD_VOICE", "GUILD_STAGE_VOICE", "GUILD_TEXT"].includes(channel.type)) {
        this.args.channels = [channel];
      } else {
        let channels = await this.getQueueChannels();
        if (conf.channel.type) {
          // @ts-ignore
          channels = channels.filter((ch) => conf.channel.type.includes(ch.type));
        }
        if (channels.length === 1) {
          this.args.channels = channels;
        } else {
          if (this.args.strings[0] === "ALL") {
            this.args.channels = channels;
          } else {
            channel = channels.find((ch) => ch.id === this.args.strings[0]);
            if (channel) {
              this.args.channels = [channel];
            }
          }
          if (this.args.channels) {
            this.args.strings.splice(0, 1); // Channel found by plaintext. remove it from args
          }
        }
      }
    }
    // Verify
    return this.verifyArgs(conf);
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

  private findArgs(options: Readonly<CommandInteractionOption[]>, type: string, accumulator: any[] = []): any[] {
    for (const option of options) {
      if ((option.type === "SUB_COMMAND" || option.type === "SUB_COMMAND_GROUP") && option.options?.length) {
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
}

export class ParsedMessage extends ParsedBase {
  public request: Message;
  private lastResponse: Message;

  constructor(message: Message) {
    super();
    this.request = message;
  }

  private static mentionRegex = RegExp(/<(@*?|#)\d+>/g);

  public async parseArgs(conf: RequiredOptions): Promise<string[]> {
    this.request.content = this.request.content.slice(conf.commandNameLength + 1); // trim command
    this.request.mentions.members.delete(this.request.guild.me.id); // remove mention of bot
    let incomingStrings = this.request.content.split(" ");
    // Members
    if (conf.members) {
      this.args.members = this.request.mentions.members;
    }
    // Roles
    if (conf.roles) {
      this.args.roles = this.request.mentions.roles;
    }
    // Channels
    if (conf.channel) {
      let channel = this.request.mentions.channels.first() as GuildBasedChannel;
      if (channel && ["GUILD_VOICE", "GUILD_STAGE_VOICE", "GUILD_TEXT"].includes(channel.type)) {
        this.args.channels = [channel];
      } else {
        let channels = await this.getQueueChannels();
        if (conf.channel.type) {
          // @ts-ignore
          channels = channels.filter((ch) => conf.channel.type.includes(ch.type));
        }
        if (channels.length === 1) {
          this.args.channels = channels;
        } else {
          if (incomingStrings[0] === "ALL") {
            if (conf.channel.required === RequiredType.OPTIONAL) {
              this.args.channels = channels;
            } else {
              await this.reply({
                content: `Can NOT target \`ALL\` queues for this command.`,
              }).catch(() => null);
            }
          }
          channel = channels.find((ch) => ch.name === this.args.strings[0]);
          if (channel) {
            this.args.channels = [channel];
          }
          if (this.args.channels) {
            incomingStrings.splice(0, 1); // Channel found by plaintext. remove it from args
          } else {
            await this.reply({
              content: `\`${incomingStrings[0]}\` is not a queue.`,
            }).catch(() => null);
          }
        }
      }
    }
    // Filter mentions
    incomingStrings = incomingStrings.filter((arg) => !arg.match(ParsedMessage.mentionRegex)?.length);
    // Strings
    if (conf.strings) {
      this.args.strings = incomingStrings.filter((arg) => isNaN(+arg));
    }
    // Numbers
    if (conf.numbers) {
      this.args.numbers = incomingStrings.filter((arg) => !isNaN(+arg)).map((arg) => +arg);
    }
    // Verify
    return this.verifyArgs(conf);
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
}
