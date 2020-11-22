import { Client } from "discord.js";
import Knex from "knex";
import config from "../config.json";

export class Base {
   public static getKnex(): Knex {
      return this.knex;
   }

   public static getClient(): Client {
      return this.client;
   }
   private static knex = Knex({
      client: config.databaseType,
      connection: {
         database: config.databaseName,
         host: config.databaseHost,
         password: config.databasePassword,
         user: config.databaseUsername,
      },
   });
   private static client = new Client({
      messageCacheLifetime: 12 * 60 * 60, // Cache messages for 12 hours
      messageCacheMaxSize: 2, // Cache up to 2 messages per channel
      messageEditHistoryMaxSize: 0, // Do not cache edits
      messageSweepInterval: 1 * 60 * 60, // Sweep every hour
      presence: {
         activity: {
            name: `${config.prefix}${config.helpCmd} for help`,
         },
         status: "online",
      },
      ws: { intents: ["GUILDS", "GUILD_VOICE_STATES", "GUILD_MESSAGES"] },
   });
}
