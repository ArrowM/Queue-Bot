import { Client, GuildMember } from "discord.js";
import { readFileSync } from "fs";
import { knex, Knex } from "knex";
import { CommandConfigJson, ConfigJson } from "./Interfaces";

export class Base {
   public static getConfig(): ConfigJson {
      return this.config;
   }

   public static getCmdConfig(): CommandConfigJson {
      return this.cmdConfig;
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

   protected static config: ConfigJson = JSON.parse(readFileSync("../config/config.json", "utf8"));
   protected static cmdConfig: CommandConfigJson = JSON.parse(readFileSync("../config/command-config.json", "utf8"));

   protected static knex = knex({
      client: process.env.DB_TYPE,
      connection: {
         database: process.env.DB_SCHEMA,
         host: process.env.DB_HOST,
         password: process.env.DB_PASS,
         user: process.env.DB_USER,
         ssl: {
            rejectUnauthorized: false,
         },
      },
   });

   protected static client = new Client({
      messageCacheLifetime: 12 * 60 * 60, // Cache messages for 12 hours
      messageCacheMaxSize: 2, // Cache up to 2 messages per channel
      messageEditHistoryMaxSize: 0, // Do not cache edits
      messageSweepInterval: 1 * 60 * 60, // Sweep every hour
      partials: ["MESSAGE", "REACTION", "USER"],
      presence: {
         activity: {
            type: `LISTENING`,
            name: `${Base.config.prefix}${Base.cmdConfig.helpCmd}`,
         },
         status: "online",
      },
      ws: { intents: ["GUILDS", "GUILD_VOICE_STATES", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS"] },
   });
}
