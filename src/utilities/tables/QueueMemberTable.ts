import { QueueChannel, QueueMember } from "../Interfaces";
import { Base } from "../Base";
import { Guild, GuildMember, Snowflake, StageChannel, TextChannel, VoiceChannel } from "discord.js";
import { BlackWhiteListTable } from "./BlackWhiteListTable";
import { PriorityTable } from "./PriorityTable";
import { QueueChannelTable } from "./QueueChannelTable";
import { QueueGuildTable } from "./QueueGuildTable";

export class QueueMemberTable {
  /**
   * Create & update QueueGuild database table if necessary
   */
  public static async initTable(): Promise<void> {
    await Base.knex.schema.hasTable("queue_members").then(async (exists) => {
      if (!exists) {
        await Base.knex.schema
          .createTable("queue_members", (table) => {
            table.increments("id").primary();
            table.bigInteger("channel_id");
            table.bigInteger("member_id");
            table.text("personal_message");
            table.timestamp("created_at").defaultTo(Base.knex.fn.now());
            table.boolean("is_priority");
          })
          .catch((e) => console.error(e));
      }
    });
  }

  public static get(channelId: Snowflake, memberId: Snowflake) {
    return Base.knex<QueueMember>("queue_members").where("channel_id", channelId).where("member_id", memberId).first();
  }

  public static getFromChannels(queueChannelIds: Snowflake[], memberId: Snowflake) {
    return Base.knex<QueueMember>("queue_members").whereIn("channel_id", queueChannelIds).where("member_id", memberId);
  }

  public static getFromId(id: Snowflake) {
    return Base.knex<QueueMember>("queue_members").where("id", id).first();
  }

  public static async setCreatedAt(memberId: Snowflake, time: string): Promise<void> {
    await this.getFromId(memberId).update("created_at", time);
  }

  public static async setPriority(channelId: Snowflake, memberId: Snowflake, isPriority: boolean): Promise<void> {
    await Base.knex<QueueMember>("queue_members")
      .where("channel_id", channelId)
      .where("member_id", memberId)
      .first()
      .update("is_priority", isPriority);
  }

  /**
   * UNORDERED. Fetch members for channel, filter out users who have left the guild.
   */
  public static async getFromQueue(queueChannel: VoiceChannel | StageChannel | TextChannel) {
    return Base.knex<QueueMember>("queue_members").where("channel_id", queueChannel.id);
  }

  public static async getFromMember(memberId: Snowflake) {
    return Base.knex<QueueMember>("queue_members").where("member_id", memberId);
  }

  /**
   * WARNING THIS MIGHT BE SLOW
   */
  public static async getMemberFromQueueMember(
    queueChannel: VoiceChannel | StageChannel | TextChannel,
    queueMember: QueueMember
  ): Promise<GuildMember> {
    try {
      return await queueChannel.guild.members.fetch(queueMember.member_id);
    } catch (e: any) {
      if ([403, 404].includes(e.httpStatus)) {
        await QueueMemberTable.unstore(queueChannel.guild.id, queueChannel.id, [queueMember.member_id]);
      }
      return undefined;
    }
  }

  /**
   *
   */
  public static async getNext(
    queueChannel: VoiceChannel | StageChannel | TextChannel,
    amount?: number
  ): Promise<QueueMember[]> {
    let query = Base.knex<QueueMember>("queue_members")
      .where("channel_id", queueChannel.id)
      .orderBy([{ column: "is_priority", order: "desc" }, "created_at"]);
    if (amount) query = query.limit(amount);

    return query;
  }

  private static unstoredMembersCache = new Map<Snowflake, string>();

  public static async store(
    queueChannel: VoiceChannel | StageChannel | TextChannel,
    member: GuildMember,
    customMessage?: string,
    force?: boolean
  ): Promise<void> {
    if (!force) {
      if (await BlackWhiteListTable.hasWhitelist(queueChannel.id)) {
        if (!(await BlackWhiteListTable.isWhitelisted(queueChannel.id, member))) {
          throw {
            author: "Queue Bot",
            message: `<@${member.id}> is not on the whitelist for \`${queueChannel.name}\`.\n`,
          };
        }
      } else if (await BlackWhiteListTable.isBlacklisted(queueChannel.id, member)) {
        throw {
          author: "Queue Bot",
          message: `<@${member.id}> is blacklisted from \`${queueChannel.name}\`.\n`,
        };
      }
      const storedChannel = await QueueChannelTable.get(queueChannel.id);
      if (storedChannel.max_members) {
        const storedQueueMembers = await this.getFromQueue(queueChannel);
        if (storedChannel.max_members <= storedQueueMembers?.length) {
          throw {
            author: "Queue Bot",
            message: `Failed to add <@${member.id}> to \`${queueChannel.name}\`. Queue is full!\n`,
          };
        }
      }
    }

    const storedMember = await QueueMemberTable.get(queueChannel.id, member.id);
    if (storedMember) {
      // || null is necessary to overwrite old values with empty ones
      storedMember.personal_message = customMessage || null;
      await QueueMemberTable.get(queueChannel.id, member.id).update(storedMember);
    } else {
      await Base.knex<QueueMember>("queue_members").insert({
        created_at: this.unstoredMembersCache.get(member.id),
        is_priority: await PriorityTable.isPriority(queueChannel.guild.id, member),
        personal_message: customMessage,
        channel_id: queueChannel.id,
        member_id: member.id,
      });
    }
    this.unstoredMembersCache.delete(member.id);
    // Assign Queue Role
    const storedQueueChannel = await QueueChannelTable.get(queueChannel.id);
    if (storedQueueChannel?.role_id) {
      await member.roles.add(storedQueueChannel.role_id).catch(() => null);
    }
  }

  public static async unstore(
    guildId: Snowflake,
    channelId: Snowflake,
    memberIds?: Snowflake[],
    gracePeriod?: number
  ): Promise<void> {
    // Retreive list of stored embeds for display channel
    let query = Base.knex<QueueMember>("queue_members").where("channel_id", channelId);
    if (memberIds) {
      query = query.whereIn("member_id", memberIds);
      if (gracePeriod) {
        // Cache members
        for (const queueMember of await query) {
          this.unstoredMembersCache.set(queueMember.member_id, queueMember.created_at);
          // Schedule cleanup of cached member
          setTimeout(() => this.unstoredMembersCache.delete(queueMember.member_id), gracePeriod * 1000);
        }
      }
    }
    const deletedMembers = await query;
    await query.delete();
    // Unassign Queue Role
    const storedQueueChannel = await QueueChannelTable.get(channelId).catch(() => null as QueueChannel);
    if (!storedQueueChannel?.role_id) return;

    const queueGuild = await QueueGuildTable.get(guildId);
    if (!queueGuild.disable_roles) {
      const guild = await Base.client.guilds.fetch(guildId).catch(() => null as Guild);
      if (!guild) return;
      for await (const deletedMember of deletedMembers) {
        const member = await guild.members.fetch(deletedMember.member_id).catch(() => null as GuildMember);
        if (!member) continue;
        await member.roles.remove(storedQueueChannel.role_id).catch(() => null);
      }
    }
  }

  public static async validate(
    queueChannel: VoiceChannel | StageChannel | TextChannel,
    members: GuildMember[]
  ): Promise<boolean> {
    let updateRequired = false;
    const storedEntries = await this.getFromQueue(queueChannel);
    for await (const entry of storedEntries) {
      const member = members.find((m) => m.id === entry.member_id);
      if (member) {
        member.guild.members.cache.set(member.id, member); // cache
      } else {
        await this.unstore(queueChannel.guild.id, queueChannel.id, [entry.member_id]);
        updateRequired = true;
      }
    }
    return updateRequired;
  }
}
