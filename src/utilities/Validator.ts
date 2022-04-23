import { Guild, Snowflake } from "discord.js";
import { AdminPermissionTable } from "./tables/AdminPermissionTable";
import { PriorityTable } from "./tables/PriorityTable";
import { QueueTable } from "./tables/QueueTable";

export class Validator {
  private static timestampCache = new Map<Snowflake, number>(); // <guild.id, timestamp>
  private static SIX_HOURS = 1000 * 60 * 60 * 6;

  /**
   * This bot stores info about channels, members, and roles in its database.
   * It's necessary to occasionally verify this data, so we don't store info that has been deleted on the user side.
   * We fetch the live data, then send it to the Table classes validate function to check the DB info.
   * Q: Then what is the cache code below?
   * A: Fetching all the live data for channels, members, and roles populates the caches in the discord.js lib.
   * To my knowledge, these caches never get swept, so the bots' memory usage would be very high.
   * The cache related code below clears the local cache, stored the lived data in local variables, then clears the
   * cache again. Then we send the local variables to the validate methods, which re-cache info that is stored in
   * the databases.
   * @param guild
   */
  public static async validateGuild(guild: Guild) {
    const cachedTime = this.timestampCache.get(guild.id);
    const now = Date.now();
    // Limit validation to once every 6 hours
    if (cachedTime && now - cachedTime < Validator.SIX_HOURS) {
      return;
    }
    this.timestampCache.set(guild.id, now);
    const me = guild.me;
    try {
      // Clear stored caches (they might have deleted data)
      guild.channels.cache.clear();
      guild.members.cache.clear();
      // Critical - "me" must be redefined after clearing
      guild.members.cache.set(me.id, me);
      // Do not clear roles - causes discord.js issues

      // Fetch new server data and move it to temp storage
      const channels = await guild.channels.fetch();
      const members = await guild.members.fetch();
      const roles = await guild.roles.fetch();

      // Clear caches again
      guild.channels.cache.clear();
      guild.members.cache.clear();
      guild.members.cache.set(me.id, me);

      // Verify data in temp storage. Once verified, cache the channels again.
      AdminPermissionTable.validate(guild, members, roles).then();
      const requireUpdate = await PriorityTable.validate(guild, members, roles);
      QueueTable.validate(requireUpdate, guild, channels, members, roles).then();
    } catch (e: any) {
      // console.error(e);
      // Nothing - we don't want to accidentally delete legit data
    }
  }

  // public static async validateAtStartup(guilds: Guild[]) {
  //    for await (const guild of guilds) {
  //       this.validateGuild(guild);
  //       await delay(400);
  //    }
  // }
}
