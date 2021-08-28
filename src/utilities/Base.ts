import { ApplicationOptions } from "discord-slash-commands-client";
import { Client, Collection, GuildMember, LimitedCollection } from "discord.js";
import { readFileSync } from "fs";
import { knex } from "knex";
import { ConfigJson } from "./Interfaces";
import { MessageCollection } from "./MessageCollection";
export class Base {
   static readonly config: ConfigJson = JSON.parse(readFileSync("../config/config.json", "utf8"));
   static readonly commands = JSON.parse(
      readFileSync("../config/commands-config.json", "utf8")
   ) as ApplicationOptions[];

   static readonly knex = knex({
      client: Base.config.databaseType,
      connection: {
         database: Base.config.databaseName,
         host: Base.config.databaseHost,
         password: Base.config.databasePassword,
         user: Base.config.databaseUsername,
      },
   });

   static readonly client = new Client({
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
      //messageCacheLifetime: 24 * 60 * 60, // Cache messages for 24 hours
      //messageSweepInterval: 1 * 60 * 60, // Sweep every hour
      //partials: ["MESSAGE", "REACTION", "USER"],
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
   });

   public static isMe(member: GuildMember): boolean {
      return member?.id === member?.guild?.me?.id;
   }

   /**
    * HELPER
    * Shuffle array using the Fisher-Yates algorithm
    */
   public static shuffle(array: any[]): void {
      for (let i = array.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [array[i], array[j]] = [array[j], array[i]];
      }
   }
}
