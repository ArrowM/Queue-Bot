import { Collection, ColorResolvable, DiscordAPIError, Guild, GuildBasedChannel, GuildMember, Role, Snowflake } from "discord.js";
import { Knex } from "knex";

import { Base } from "../Base";
import { QUEUABLE_VOICE_CHANNELS, StoredQueue } from "../Interfaces";
import { Parsed } from "../ParsingUtils";
import { SchedulingUtils } from "../SchedulingUtils";
import { SlashCommands } from "../SlashCommands";
import { BlackWhiteListTable } from "./BlackWhiteListTable";
import { DisplayChannelTable } from "./DisplayChannelTable";
import { QueueGuildTable } from "./QueueGuildTable";
import { QueueMemberTable } from "./QueueMemberTable";
import { ScheduleTable } from "./ScheduleTable";

export class QueueTable {
  // Create & update database table if necessary
  public static async initTable() {
    await Base.knex.schema.hasTable("queue_channels").then(async (exists) => {
      if (!exists) {
        await Base.knex.schema
          .createTable("queue_channels", (table) => {
            table.bigInteger("queue_channel_id").primary();
            table.integer("auto_fill");
            table.text("color");
            table.boolean("enable_partial_pull");
            table.integer("grace_period");
            table.bigInteger("guild_id");
            table.text("header");
            table.boolean("hide_button");
            table.boolean("is_locked");
            table.integer("max_members");
            table.integer("pull_num");
            table.bigInteger("target_channel_id");
            table.boolean("unmute_on_next");
          })
          .catch((e) => console.error(e));
      }
    });
  }

  public static get(queueChannelId: Snowflake) {
    return Base.knex<StoredQueue>("queue_channels").where("queue_channel_id", queueChannelId).first();
  }

  public static getFromGuild(guildId: Snowflake) {
    return Base.knex<StoredQueue>("queue_channels").where("guild_id", guildId);
  }

  public static getFromTarget(targetChannelId: Snowflake) {
    return Base.knex<StoredQueue>("queue_channels").where("target_channel_id", targetChannelId);
  }

  public static async setHeader(queueChannelId: Snowflake, message: string) {
    await QueueTable.get(queueChannelId).update("header", message || null);
  }

  public static async setHideButton(queueChannelId: Snowflake, hidden: boolean) {
    await QueueTable.get(queueChannelId).update("hide_button", hidden);
  }

  public static async setLock(queueChannelId: Snowflake, is_locked: boolean) {
    await QueueTable.get(queueChannelId).update("is_locked", is_locked);
  }

  public static async setMaxMembers(queueChannelId: Snowflake, max: number) {
    await QueueTable.get(queueChannelId).update("max_members", max);
  }

  public static async setTarget(queueChannelId: Snowflake, targetChannelId: Snowflake | Knex.Raw) {
    await QueueTable.get(queueChannelId).update("target_channel_id", targetChannelId);
  }

  public static async setColor(queueChannel: GuildBasedChannel, value: ColorResolvable) {
    await QueueTable.get(queueChannel.id).update("color", value);
    const storedQueue = await QueueTable.get(queueChannel.id);
    if (storedQueue?.role_id) {
      const role = await queueChannel.guild.roles.fetch(storedQueue.role_id).catch(() => null as Role);
      await role?.setColor(value).catch(() => null);
    }
  }

  public static async setGraceperiod(queueChannelId: Snowflake, value: number) {
    await QueueTable.get(queueChannelId).update("grace_period", value);
  }

  public static async setAutopull(queueChannelId: Snowflake, value: boolean) {
    await QueueTable.get(queueChannelId).update("auto_fill", value ? 1 : 0);
  }

  public static async setPullnum(queueChannelId: Snowflake, number: number, enable_partial_pulling: boolean) {
    await QueueTable.get(queueChannelId).update("pull_num", number).update("enable_partial_pull", enable_partial_pulling);
  }

  public static async setRoleId(queueChannel: GuildBasedChannel, role: Role) {
    await QueueTable.get(queueChannel.id).update("role_id", role.id);
    const queueMembers = await QueueMemberTable.getFromQueueUnordered(queueChannel);
    for await (const queueMember of queueMembers) {
      const member = await QueueMemberTable.getMemberFromQueueMember(queueChannel, queueMember);
      if (!member) {
        continue;
      }
      await member.roles.add(role);
    }
  }

  public static async setUnmute(queueChannelId: Snowflake, value: boolean) {
    await QueueTable.get(queueChannelId).update("unmute_on_next", value ? 1 : 0);
  }

  public static async deleteRoleId(queueChannel: GuildBasedChannel) {
    await QueueTable.get(queueChannel.id).update("role_id", Base.knex.raw("DEFAULT"));
  }

  public static async fetchFromGuild(guild: Guild): Promise<Collection<Snowflake, GuildBasedChannel>> {
    const queueChannelIdsToRemove: Snowflake[] = [];
    // Fetch stored channels
    const storedQueues = await Base.knex<StoredQueue>("queue_channels").where("guild_id", guild.id);
    const queueChannels: Collection<Snowflake, GuildBasedChannel> = new Collection();
    // Check for deleted channels
    // Going backwards allows the removal of entries while visiting each one
    for (let i = storedQueues.length - 1; i >= 0; i--) {
      const queueChannelId = storedQueues[i].queue_channel_id;
      const queueChannel = guild.channels.cache.find((s) => s.id === queueChannelId);
      if (queueChannel) {
        // Still exists, add to return list
        queueChannels.set(queueChannelId, queueChannel);
      } else {
        // Channel has been deleted, update database
        queueChannelIdsToRemove.push(queueChannelId);
      }
    }
    for await (const queueChannelId of queueChannelIdsToRemove) {
      await QueueTable.unstore(guild.id, queueChannelId);
    }
    return queueChannels;
  }

  public static async createQueueRole(parsed: Parsed, channel: GuildBasedChannel, color: ColorResolvable): Promise<Role> {
    let prefix = (await QueueGuildTable.get(channel.guildId)).role_prefix;
    const role = await channel.guild.roles
      .create({
        color: color,
        mentionable: true,
        name: (prefix == null ? "In queue: " : prefix) + channel.name,
      })
      .catch(async (e: DiscordAPIError) => {
        if ([403, 404].includes(e.httpStatus)) {
          await parsed
            .reply({
              content:
                "WARNING: I could not create a server role. If you want queue members to receive a role, follow these steps:" +
                "\n1. Grant me the Manage Roles permission **or** click the link below." +
                "\n2. Then use `/display` to create role.",
              embeds: [
                {
                  title: "Update Permission",
                  url: Base.inviteURL,
                },
              ],
              commandDisplay: "EPHEMERAL",
            })
            .catch(() => null);
          return null;
        }
      });
    if (role) {
      await QueueTable.setRoleId(channel, role);
    }
    return role;
  }

  public static async deleteQueueRole(guildId: Snowflake, channel: StoredQueue, parsed?: Parsed) {
    await QueueTable.get(channel.queue_channel_id).update("role_id", Base.knex.raw("DEFAULT"));
    const roleId = channel?.role_id;
    if (roleId) {
      const guild = await Base.client.guilds.fetch(guildId).catch(() => null as Guild);
      if (guild) {
        const role = await guild.roles.fetch(roleId).catch(() => null as Role);
        await role?.delete().catch(async (e: DiscordAPIError) => {
          if ([403, 404].includes(e.httpStatus)) {
            await parsed
              ?.reply({
                content: `ERROR: Failed to delete server role for queue. Please:\n1. Grant me the Manage Roles permission **or** click this link\n2. Manually delete the \`${role.name}\` role`,
                embeds: [
                  {
                    title: "Update Permission",
                    url: Base.inviteURL,
                  },
                ],
                commandDisplay: "EPHEMERAL",
              })
              .catch(console.error);
          }
        });
      }
    }
  }

  public static async store(parsed: Parsed, channel: GuildBasedChannel, maxMembers?: number) {
    // Store
    await Base.knex<StoredQueue>("queue_channels").insert({
      auto_fill: 1,
      color: Base.config.color,
      grace_period: Base.config.gracePeriod,
      guild_id: parsed.storedGuild.guild_id,
      max_members: maxMembers,
      pull_num: 1,
      queue_channel_id: channel.id,
    });
    // @ts-ignore
    if (QUEUABLE_VOICE_CHANNELS.includes(channel.type)) {
      const members = channel.members as Collection<string, GuildMember>;
      for await (const member of members.filter((member) => !member.user.bot).values()) {
        await QueueMemberTable.store(channel, member).catch(() => null);
      }
    }

    // Timeout for message order
    setTimeout(() => SlashCommands.modifyCommandsForGuild(parsed.request.guild, parsed).catch(() => null), 500);
    if ((await QueueTable.getFromGuild(parsed.request.guildId)).length > 25) {
      await parsed.reply({
        content:
          `WARNING: ${
            channel.guild || "**" + channel.name + "**"
          } will not be available in slash commands due to a Discord limit of 25 choices per command parameter. ` +
          ` To interact with this new queue, you must delete another queue.`,
      });
    }
  }

  public static async unstore(guildId: Snowflake, channelId?: Snowflake, parsed?: Parsed) {
    let query = Base.knex<StoredQueue>("queue_channels").where("guild_id", guildId);
    // Delete store db entries
    if (channelId) {
      query = query.where("queue_channel_id", channelId);
    }
    const queueChannels = await query;

    const promises = [];
    for (const queueChannel of queueChannels) {
      promises.push(
        QueueTable.deleteQueueRole(guildId, queueChannel, parsed),
        BlackWhiteListTable.unstore(2, queueChannel.queue_channel_id),
        DisplayChannelTable.unstore(queueChannel.queue_channel_id),
        QueueMemberTable.unstore(guildId, queueChannel.queue_channel_id),
        ScheduleTable.unstore(queueChannel.queue_channel_id)
      );
    }
    await Promise.all(promises);
    await query.delete();

    // Timeout for message order
    const guild = await Base.client.guilds.fetch(guildId).catch(() => null as Guild);
    if (guild) {
      setTimeout(() => SlashCommands.modifyCommandsForGuild(guild, parsed).catch(() => null), 500);
    }
  }

  public static async validate(
    requireGuildUpdate: boolean,
    guild: Guild,
    channels: Collection<Snowflake, GuildBasedChannel>,
    members: Collection<Snowflake, GuildMember>,
    roles: Collection<Snowflake, Role>
  ) {
    const storedEntries = await QueueTable.getFromGuild(guild.id);
    for await (const entry of storedEntries) {
      let requireChannelUpdate = false;
      const queueChannel = channels.find((c) => c?.id === entry.queue_channel_id);
      if (queueChannel) {
        Base.client.guilds.cache.get(guild.id).channels.cache.set(queueChannel.id, queueChannel); // cache
        guild.channels.cache.set(queueChannel.id, queueChannel); // cache
        const results = await Promise.all([
          BlackWhiteListTable.validate(queueChannel, members, roles),
          DisplayChannelTable.validate(guild, queueChannel, channels),
          QueueMemberTable.validate(queueChannel, members),
        ]);
        if (results.includes(true)) {
          requireChannelUpdate = true;
        }
      } else {
        await QueueTable.unstore(guild.id, entry.queue_channel_id);
        requireChannelUpdate = true;
      }
      if (requireGuildUpdate || requireChannelUpdate) {
        // If visual data has been unstored, schedule a display update.
        const storedGuild = await QueueGuildTable.get(guild.id);
        await SchedulingUtils.scheduleDisplayUpdate(storedGuild, queueChannel);
      }
    }
  }
}
