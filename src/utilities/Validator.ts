import { Guild, Snowflake, StageChannel, TextChannel, VoiceChannel } from "discord.js";
import { AdminPermissionTable } from "./tables/AdminPermissionTable";
import { PriorityTable } from "./tables/PriorityTable";
import { QueueChannelTable } from "./tables/QueueChannelTable";

export class Validator {
   private static timestampCache = new Map<Snowflake, number>(); // <guild.id, timestamp>
   private static SIX_HOURS = 1000 * 60 * 60 * 6;

   /**
    * This bot stores info about channels, members, and roles in it's database.
    * It's necessary to occasionally verify this data so we don't store info that has been deleted on the user side.
    * We fetch the live data, then send it to the Table classes validate function to check the DB info.
    * Q: Then what is the cache code below?
    * A: Fetching all of the live data for channels, members, and roles populates the caches in the discord.js lib.
    * To my knowledge, these caches never get swept, so the bots memory usage would be very high.
    * The cache related code below clears the local cache, stored the lived data in local variables, then clears the
    * cache again. Then we send the local variables to the validate methods, which re-cache info that is stored in
    * the databases.
    * @param guild
    */
   public static async validateGuild(guild: Guild): Promise<void> {
      const cachedTime = this.timestampCache.get(guild.id);
      const now = Date.now();
      if (cachedTime && now - cachedTime < Validator.SIX_HOURS) return; // Limit validation to once every 6 hours
      this.timestampCache.set(guild.id, now);
      const me = guild.me;
      try {
         // Clear stored caches (they might have deleted data)
         guild.channels.cache.clear();
         guild.members.cache.clear();
         // Do not clear roles - causes discord.js issues

         // Fetch new server data and store it
         const channels = Array.from((await guild.channels.fetch()).values()) as (
            | TextChannel
            | VoiceChannel
            | StageChannel
         )[];
         const members = Array.from((await guild.members.fetch()).values());
         const roles = Array.from((await guild.roles.fetch()).values());

         // Clear stored cache (we only want to cache relevant info - done below)
         guild.members.cache.clear();
         guild.channels.cache.clear();

         // Critical - "me" must be redefined after clearing
         guild.members.cache.set(me.id, me);

         // Verify that stored data is contained within server data
         AdminPermissionTable.validate(guild, members, roles).then();
         const requireUpdate = await PriorityTable.validate(guild, members, roles);
         QueueChannelTable.validate(requireUpdate, guild, channels, members, roles).then();
      } catch (e) {
         // Nothing - we don't want to accidentally delete legit data
      }
   }

   // public static async validateAtStartup(guilds: Guild[]): Promise<void> {
   //    for await (const guild of guilds) {
   //       this.validateGuild(guild);
   //       await delay(400);
   //    }
   // }
}
