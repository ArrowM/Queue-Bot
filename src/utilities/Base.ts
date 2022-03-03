import { ApplicationOptions } from "discord-slash-commands-client";
import { Client, Collection, Guild, GuildMember, LimitedCollection, Snowflake } from "discord.js";
import { readFileSync, writeFileSync } from "fs";
import { knex } from "knex";
import { ConfigJson, Timezone } from "./Interfaces";
import _ from "lodash";
import { MessageCollection } from "./MessageCollection";

export class Base {
  static readonly config = this.getJSON("config/config.json") as ConfigJson;
  static readonly commands = this.getJSON("config/commands-config.json") as ApplicationOptions[];
  static readonly lastCommands = (this.getJSON("data/last-commands-config.json") || []) as ApplicationOptions[];
  static readonly timeZones = this.getJSON("data/timezone-list.json") as Timezone[];
  static getJSON(path: string): any {
    const str = readFileSync(path, { encoding: "utf8", flag: "as+" });
    return str ? JSON.parse(str) : undefined;
  }
  static readonly inviteURL =
    `https://discord.com/api/oauth2/authorize?client_id=` +
    Base.config.clientId +
    `&permissions=2433838096&scope=applications.commands%20bot`;
  static readonly knex = knex({
    client: Base.config.databaseType,
    connection: {
      database: Base.config.databaseName,
      host: Base.config.databaseHost,
      password: Base.config.databasePassword,
      user: Base.config.databaseUsername,
    },
  });
  static readonly client: Client = new Client({
    // makeCache: Options.cacheWithLimits({
    //     MessageManager: {
    //       maxSize: 0,
    //       keepOverLimit: (key: any, value: any) => {
    //         const msg = value as Message;
    //         return msg?.author?.id && msg.author.id !== Base.client.user.id;
    //       }
    //     },
    //     GuildBanManager: 0,
    //     GuildEmojiManager: 0,
    //     PresenceManager: 0,
    //     ReactionManager: 0,
    //     ReactionUserManager: 0,
    //     StageInstanceManager: 0,
    //     ThreadManager: 0,
    //     ThreadMemberManager: 0,
    //   }),
    //
    // sweepers: {
    //   messages: {
    //     interval:     60 * 60,
    //     lifetime: 6 * 60 * 60,
    //   },
    //   guildMembers: {
    //     interval:     60 * 60,
    //     lifetime: 6 * 60 * 60,
    //     filter: (value: GuildMember, key: string, collection: Collection<string, GuildMember>) => {
    //       return true;
    //     }
    //   },
    // },

    makeCache: (manager) => {
      if ("MessageManager" === manager.name) {
        return new MessageCollection({ maxSize: 5 });
      } else if (
        [
          "GuildBanManager",
          "GuildEmojiManager",
          "PresenceManager",
          "ReactionManager",
          "ReactionUserManager",
          "StageInstanceManager",
          "ThreadManager",
          "ThreadMemberManager",
        ].includes(manager.name)
      ) {
        return new LimitedCollection({ maxSize: 0 });
      } else {
        return new Collection();
      }
    },
    // DEPRECATED
    // messageCacheLifetime: 24 * 60 * 60, // Cache messages for 24 hours
    // messageSweepInterval: 1 * 60 * 60, // Sweep every hour
    presence: {
      activities: [
        {
          type: "LISTENING",
          name: "/help",
        },
      ],
      status: "online",
    },
    intents: ["GUILDS", "GUILD_VOICE_STATES", "GUILD_MESSAGES", "GUILD_MEMBERS"],
    shards: "auto",
  });

  public static isMe(member: GuildMember): boolean {
    return member?.id === member?.guild?.me?.id;
  }

  public static haveCommandsChanged(): boolean {
    return !_.isEqual(this.commands, this.lastCommands);
  }

  public static archiveCommands(): void {
    writeFileSync(
      "../data/last-commands-config.json",
      readFileSync("../config/commands-config.json", { encoding: "utf8" })
    );
  }

  public static getTimezone(utcOffset: number): Timezone {
    return this.timeZones.find((t) => t.offset === utcOffset);
  }

  /**
   * Shuffle array using the Fisher-Yates algorithm
   */
  public static shuffle(array: Collection<Snowflake, Guild> | any[]): void {
    // @ts-ignore
    for (let i = (array.length || array.size) - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}
