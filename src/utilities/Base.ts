import { Client, Collection, GuildMember, LimitedCollection } from "discord.js";
import { readFileSync } from "fs";
import { knex, Knex } from "knex";
import { ConfigJson } from "./Interfaces";
import { MessageCollection } from "./MessageCollection";

export class Base {
   protected static config: ConfigJson = JSON.parse(readFileSync("../config/config.json", "utf8"));

   protected static knex = knex({
      client: Base.config.databaseType,
      connection: {
         database: Base.config.databaseName,
         host: Base.config.databaseHost,
         password: Base.config.databasePassword,
         user: Base.config.databaseUsername,
      },
   });

   protected static client = new Client({
      makeCache: (manager) => {
         if ("MessageManager" === manager.name) {
            return new MessageCollection(5);
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
            return new LimitedCollection(0);
         } else {
            return new Collection();
         }
      },
      messageCacheLifetime: 24 * 60 * 60, // Cache messages for 24 hours
      messageSweepInterval: 1 * 60 * 60, // Sweep every hour
      partials: ["MESSAGE", "REACTION", "USER"],
      presence: {
         activities: [
            {
               type: "LISTENING",
               name: "/help",
            },
         ],
         status: "online",
      },
      intents: ["GUILDS", "GUILD_VOICE_STATES", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS"],
   });

   public static getConfig(): ConfigJson {
      return this.config;
   }

   public static getKnex(): Knex {
      return this.knex;
   }

   public static getClient(): Client {
      return this.client;
   }

   public static isMe(member: GuildMember): boolean {
      return member.id === member.guild.me.id;
   }
}
