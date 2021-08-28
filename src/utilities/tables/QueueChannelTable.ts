import {
   DiscordAPIError,
   Guild,
   ColorResolvable,
   Role,
   Snowflake,
   TextChannel,
   VoiceChannel,
   StageChannel,
   GuildMember,
} from "discord.js";
import { QueueChannel, QueueGuild } from "../Interfaces";
import { Base } from "../Base";
import { DisplayChannelTable } from "./DisplayChannelTable";
import { QueueMemberTable } from "./QueueMemberTable";
import { Knex } from "knex";
import { ParsedCommand, ParsedMessage } from "../ParsingUtils";
import { Commands } from "../../Commands";
import { BlackWhiteListTable } from "./BlackWhiteListTable";
import { SchedulingUtils } from "../SchedulingUtils";
import { SlashCommands } from "../SlashCommands";

export class QueueChannelTable {
   /**
    * Create & update QueueChannel database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.knex.schema.hasTable("queue_channels").then(async (exists) => {
         if (!exists) {
            await Base.knex.schema
               .createTable("queue_channels", (table) => {
                  table.bigInteger("queue_channel_id").primary();
                  table.integer("auto_fill");
                  table.text("color");
                  table.integer("grace_period");
                  table.bigInteger("guild_id");
                  table.text("header");
                  table.boolean("hide_button");
                  table.integer("max_members");
                  table.integer("pull_num");
                  table.bigInteger("target_channel_id");
               })
               .catch((e) => console.error(e));
         }
      });
   }

   public static get(queueChannelId: Snowflake) {
      return Base.knex<QueueChannel>("queue_channels").where("queue_channel_id", queueChannelId).first();
   }

   public static getFromGuild(guildId: Snowflake) {
      return Base.knex<QueueChannel>("queue_channels").where("guild_id", guildId);
   }

   public static getFromTarget(targetChannelId: Snowflake) {
      return Base.knex<QueueChannel>("queue_channels").where("target_channel_id", targetChannelId);
   }

   public static async updateMaxMembers(queueChannelId: Snowflake, max: number) {
      await this.get(queueChannelId).update("max_members", max);
   }

   public static async updateHeader(queueChannelId: Snowflake, message: string) {
      await this.get(queueChannelId).update("header", message);
   }

   public static async updateHideButton(queueChannelId: Snowflake, status: boolean) {
      await this.get(queueChannelId).update("hide_button", status);
   }

   public static async updateTarget(queueChannelId: Snowflake, targetChannelId: Snowflake | Knex.Raw) {
      await this.get(queueChannelId).update("target_channel_id", targetChannelId);
   }

   public static async updateColor(queueChannel: VoiceChannel | StageChannel | TextChannel, value: ColorResolvable) {
      await this.get(queueChannel.id).update("color", value);
      const storedQueueChannel = await this.get(queueChannel.id);
      if (storedQueueChannel?.role_id) {
         const role = await queueChannel.guild.roles.fetch(storedQueueChannel.role_id).catch(() => null as Role);
         await role?.setColor(value).catch(() => null);
      }
   }

   public static async updateGraceperiod(queueChannelId: Snowflake, value: number) {
      await this.get(queueChannelId).update("grace_period", value);
   }

   public static async updateAutopull(queueChannelId: Snowflake, value: number) {
      await this.get(queueChannelId).update("auto_fill", value);
   }

   public static async updatePullnum(queueChannelId: Snowflake, value: number) {
      await this.get(queueChannelId).update("pull_num", value);
   }

   public static async updateRoleId(queueChannel: VoiceChannel | StageChannel | TextChannel, role: Role) {
      await this.get(queueChannel.id).update("role_id", role.id);
      const queueMembers = await QueueMemberTable.getFromQueue(queueChannel);
      for await (const queueMember of queueMembers) {
         const member = await QueueMemberTable.getMemberFromQueueMember(queueChannel, queueMember);
         if (!member) continue;
         await member.roles.add(role);
      }
   }

   public static async fetchFromGuild(guild: Guild): Promise<(VoiceChannel | StageChannel | TextChannel)[]> {
      const queueChannelIdsToRemove: Snowflake[] = [];
      // Fetch stored channels
      const storedQueueChannels = await Base.knex<QueueChannel>("queue_channels").where("guild_id", guild.id);
      const storedChannels = (await guild.channels.fetch().catch(() => null)) as (
         | VoiceChannel
         | StageChannel
         | TextChannel
      )[];
      const queueChannels: (VoiceChannel | StageChannel | TextChannel)[] = [];
      // Check for deleted channels
      // Going backwards allows the removal of entries while visiting each one
      for (let i = storedQueueChannels.length - 1; i >= 0; i--) {
         const queueChannelId = storedQueueChannels[i].queue_channel_id;
         const queueChannel = storedChannels.find((s) => s.id === queueChannelId);
         if (queueChannel) {
            // Still exists, add to return list
            queueChannels.push(queueChannel);
         } else {
            // Channel has been deleted, update database
            queueChannelIdsToRemove.push(queueChannelId);
         }
      }
      for (const queueChannelId of queueChannelIdsToRemove) {
         await this.unstore(guild.id, queueChannelId);
      }
      return queueChannels;
   }

   public static async createQueueRole(
      parsed: ParsedCommand | ParsedMessage,
      channel: VoiceChannel | StageChannel | TextChannel,
      color: ColorResolvable
   ): Promise<Role> {
      return await channel.guild.roles
         .create({
            color: color,
            mentionable: true,
            name: "In queue: " + channel.name,
         })
         .catch(async (e: DiscordAPIError) => {
            if ([403, 404].includes(e.httpStatus)) {
               await parsed
                  .reply({
                     content:
                        "ERROR: Failed to create server role for queue. Please:\n1. Grant me the Manage Roles permission **or** click the link below\n2. Then use `/display` to create role",
                     embeds: [
                        {
                           title: "Update Permission",
                           url: "https://discord.com/api/oauth2/authorize?client_id=679018301543677959&permissions=2433838096&scope=applications.commands%20bot",
                        },
                     ],
                     commandDisplay: "EPHEMERAL",
                  })
                  .catch(console.error);
            }
            return null;
         });
   }

   public static async deleteQueueRole(
      guildId: Snowflake,
      channel: QueueChannel,
      parsed: ParsedCommand | ParsedMessage
   ): Promise<void> {
      await this.get(channel.queue_channel_id).update("role_id", Base.knex.raw("DEFAULT"));
      const roleId = channel?.role_id;
      if (roleId) {
         const guild = await Base.client.guilds.fetch(guildId).catch(() => null as Guild);
         if (guild) {
            const role = await guild.roles.fetch(roleId).catch(() => null as Role);
            await role?.delete().catch(async (e: DiscordAPIError) => {
               if ([403, 404].includes(e.httpStatus)) {
                  await parsed
                     .reply({
                        content: `ERROR: Failed to delete server role for queue. Please:\n1. Grant me the Manage Roles permission **or** click this link\n2. Manually delete the \`${role.name}\` role`,
                        embeds: [
                           {
                              title: "Update Permission",
                              url: "https://discord.com/api/oauth2/authorize?client_id=679018301543677959&permissions=2433838096&scope=applications.commands%20bot",
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

   public static async store(
      parsed: ParsedCommand | ParsedMessage,
      channel: VoiceChannel | StageChannel | TextChannel,
      maxMembers?: number
   ): Promise<void> {
      // Store
      await Base.knex<QueueChannel>("queue_channels")
         .insert({
            auto_fill: 1,
            color: Base.config.color,
            grace_period: Base.config.gracePeriod,
            guild_id: channel.guild.id,
            max_members: maxMembers,
            pull_num: 1,
            queue_channel_id: channel.id,
         })
         .catch(() => null);
      if (["GUILD_VOICE", "GUILD_STAGE_VOICE"].includes(channel.type)) {
         for await (const member of channel.members.filter((member) => !member.user.bot).values()) {
            await QueueMemberTable.store(channel, member).catch(() => null);
         }
      }
      await Commands.display(parsed, channel);

      // Timeout for message order
      setTimeout(() => SlashCommands.modifyCommandsForGuild(parsed.request.guild, parsed).catch(() => null), 500);
      if ((await QueueChannelTable.getFromGuild(parsed.request.guild.id)).length > 25) {
         await parsed.reply({
            content:
               `WARNING: \`${channel.name}\` will not be available in slash commands due to a Discord limit of 25 choices per command parameter. ` +
               ` To interact with this new queue, you must use the alternate prefix (\`/altprefix on\`) or delete another queue.`,
         });
      }
   }

   public static async unstore(
      guildId: Snowflake,
      channelId?: Snowflake,
      parsed?: ParsedCommand | ParsedMessage
   ): Promise<void> {
      let query = Base.knex<QueueChannel>("queue_channels").where("guild_id", guildId);
      // Delete store db entries
      if (channelId) query = query.where("queue_channel_id", channelId);
      const queueChannels = await query;

      for await (const queueChannel of queueChannels) {
         // Delete role
         await this.deleteQueueRole(guildId, queueChannel, parsed);
         await BlackWhiteListTable.unstore(2, queueChannel.queue_channel_id);
         await DisplayChannelTable.unstore(queueChannel.queue_channel_id);
         await QueueMemberTable.unstore(guildId, queueChannel.queue_channel_id);
      }
      await query.delete();

      // Timeout for message order
      const guild = await Base.client.guilds.fetch(guildId).catch(() => null as Guild);
      if (guild) {
         setTimeout(() => SlashCommands.modifyCommandsForGuild(guild, parsed).catch(() => null), 500);
      }
   }

   public static async validate(
      requireGuildUpdate: boolean,
      queueGuild: QueueGuild,
      guild: Guild,
      channels: (VoiceChannel | StageChannel | TextChannel)[],
      members: GuildMember[],
      roles: Role[]
   ): Promise<void> {
      const storedEntries = await this.getFromGuild(guild.id);
      for await (const entry of storedEntries) {
         let requireChannelUpdate = false;
         const queueChannel = channels.find((c) => c.id === entry.queue_channel_id);
         if (queueChannel) {
            queueChannel.guild.channels.cache.set(queueChannel.id, queueChannel); // cache
            const results = await Promise.all([
               BlackWhiteListTable.validate(queueChannel, members, roles),
               DisplayChannelTable.validate(queueChannel, channels),
               QueueMemberTable.validate(queueChannel, members),
            ]);
            if (results.includes(true)) {
               requireChannelUpdate = true;
            }
         } else {
            await this.unstore(guild.id, entry.queue_channel_id);
            requireChannelUpdate = true;
         }
         if (requireGuildUpdate || requireChannelUpdate) {
            // If visual data has been unstored, schedule a display update.
            SchedulingUtils.scheduleDisplayUpdate(queueGuild, queueChannel);
         }
      }
   }
}
