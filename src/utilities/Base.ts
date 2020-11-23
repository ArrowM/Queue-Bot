import { Client } from "discord.js";
import { readFileSync } from "fs";
import Knex from "knex";

export class Base {
   public static getConfig() {
      return this.config;
   }

   public static getKnex(): Knex {
      return this.knex;
   }

   public static getClient(): Client {
      return this.client;
   }

   protected static config =
      JSON.parse(readFileSync("./config/config.json", "utf8")).catch((): any => null) ||
      JSON.parse(readFileSync("../config/config.json", "utf8"));

   protected static knex = Knex({
      client: Base.config.databaseType,
      connection: {
         database: Base.config.databaseName,
         host: Base.config.databaseHost,
         password: Base.config.databasePassword,
         user: Base.config.databaseUsername,
      },
   });

   protected static client = new Client({
      messageCacheLifetime: 12 * 60 * 60, // Cache messages for 12 hours
      messageCacheMaxSize: 2, // Cache up to 2 messages per channel
      messageEditHistoryMaxSize: 0, // Do not cache edits
      messageSweepInterval: 1 * 60 * 60, // Sweep every hour
      presence: {
         activity: {
            name: `${Base.config.prefix}${Base.config.helpCmd} for help`,
         },
         status: "online",
      },
      ws: { intents: ["GUILDS", "GUILD_VOICE_STATES", "GUILD_MESSAGES"] },
   });
}
