import { DiscordAPIError, Guild, ColorResolvable, Role, Snowflake, TextChannel, VoiceChannel } from "discord.js";
import { QueueChannel } from "../Interfaces";
import { Base } from "../Base";
import { DisplayChannelTable } from "./DisplayChannelTable";
import { QueueMemberTable } from "./QueueMemberTable";
import { Knex } from "knex";
import { Parsed } from "../ParsingUtils";
import { Commands } from "../../Commands";
import { BlackWhiteListTable } from "./BlackWhiteListTable";
import delay from "delay";

export class QueueChannelTable {
   /**
    * Create & update QueueChannel database table if necessary
    */
   public static async initTable(): Promise<void> {
      await Base.getKnex()
         .schema.hasTable("queue_channels")
         .then(async (exists) => {
            if (!exists) {
               await Base.getKnex()
                  .schema.createTable("queue_channels", (table) => {
                     table.bigInteger("queue_channel_id").primary();
                     table.integer("auto_fill");
                     table.text("color");
                     table.integer("grace_period");
                     table.bigInteger("guild_id");
                     table.text("header");
                     table.integer("max_members");
                     table.integer("pull_num");
                     table.bigInteger("target_channel_id");
                  })
                  .catch((e) => console.error(e));
            }
         });
   }

   /**
    * Cleanup deleted QueueChannels
    **/
   public static async validateEntries(guild: Guild) {
      const entries = await Base.getKnex()<QueueChannel>("queue_channels").where("guild_id", guild.id);
      for await (const entry of entries) {
         try {
            await delay(1000);
            const queueChannel = (await guild.channels.fetch(entry.queue_channel_id)) as VoiceChannel | TextChannel;
            if (queueChannel) {
               BlackWhiteListTable.validateEntries(guild, queueChannel);
               DisplayChannelTable.validateEntries(guild, queueChannel);
               QueueMemberTable.validateEntries(guild, queueChannel);
            } else {
               this.unstore(guild.id, entry.queue_channel_id);
            }
         } catch (e) {
            // SKIP
         }
      }
   }

   public static get(queueChannelId: Snowflake) {
      return Base.getKnex()<QueueChannel>("queue_channels").where("queue_channel_id", queueChannelId).first();
   }

   public static getFromGuild(guildId: Snowflake) {
      return Base.getKnex()<QueueChannel>("queue_channels").where("guild_id", guildId);
   }

   public static getFromTarget(targetChannelId: Snowflake) {
      return Base.getKnex()<QueueChannel>("queue_channels").where("target_channel_id", targetChannelId);
   }

   public static async updateMaxMembers(queueChannelId: Snowflake, max: number) {
      await this.get(queueChannelId).update("max_members", max);
   }

   public static async updateHeader(queueChannelId: Snowflake, message: string) {
      await this.get(queueChannelId).update("header", message);
   }

   public static async updateTarget(queueChannelId: Snowflake, targetChannelId: Snowflake | Knex.Raw<any>) {
      await this.get(queueChannelId).update("target_channel_id", targetChannelId);
   }

   public static async updateColor(queueChannel: VoiceChannel | TextChannel, value: ColorResolvable) {
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

   public static async updateRoleId(queueChannel: VoiceChannel | TextChannel, role: Role) {
      await this.get(queueChannel.id).update("role_id", role.id);
      const queueMembers = await QueueMemberTable.getFromQueue(queueChannel);
      for await (const queueMember of queueMembers) {
         await queueMember.member.roles.add(role);
      }
   }

   public static async fetchFromGuild(guild: Guild): Promise<(VoiceChannel | TextChannel)[]> {
      const queueChannelIdsToRemove: Snowflake[] = [];
      // Fetch stored channels
      const storedQueueChannels = await Base.getKnex()<QueueChannel>("queue_channels").where("guild_id", guild.id);
      const queueChannels: (VoiceChannel | TextChannel)[] = [];
      // Check for deleted channels
      // Going backwards allows the removal of entries while visiting each one
      for (let i = storedQueueChannels.length - 1; i >= 0; i--) {
         const queueChannelId = storedQueueChannels[i].queue_channel_id;
         const queueChannel = (await guild.channels.fetch(queueChannelId).catch(() => null)) as VoiceChannel | TextChannel;
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

   public static async createQueueRole(parsed: Parsed, channel: VoiceChannel | TextChannel, color: ColorResolvable): Promise<Role> {
      return await channel.guild.roles
         .create({
            color: color,
            mentionable: true,
            name: "In queue: " + channel.name,
         })
         .catch(async (e: DiscordAPIError) => {
            if (e.httpStatus === 403) {
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
                     ephemeral: true,
                  })
                  .catch(console.error);
            }
            return null;
         });
   }

   public static async deleteQueueRole(guildId: Snowflake, channel: QueueChannel, parsed: Parsed): Promise<void> {
      await this.get(channel.queue_channel_id).update("role_id", Base.getKnex().raw("DEFAULT"));
      const roleId = channel?.role_id;
      if (roleId) {
         const guild = await Base.getClient()
            .guilds.fetch(guildId)
            .catch(() => null as Guild);
         if (guild) {
            const role = await guild.roles.fetch(roleId).catch(() => null as Role);
            await role?.delete().catch(async (e: DiscordAPIError) => {
               if (e.httpStatus === 403) {
                  await parsed
                     .reply({
                        content: `ERROR: Failed to delete server role for queue. Please:\n1. Grant me the Manage Roles permission **or** click this link\n2. Manually delete the \`${role.name}\` role`,
                        embeds: [
                           {
                              title: "Update Permission",
                              url: "https://discord.com/api/oauth2/authorize?client_id=679018301543677959&permissions=2433838096&scope=applications.commands%20bot",
                           },
                        ],
                        ephemeral: true,
                     })
                     .catch(console.error);
               }
            });
         }
      }
   }

   public static async store(parsed: Parsed, channel: VoiceChannel | TextChannel, maxMembers?: number): Promise<void> {
      // Store
      await Base.getKnex()<QueueChannel>("queue_channels")
         .insert({
            auto_fill: 1,
            color: Base.getConfig().color,
            grace_period: Base.getConfig().gracePeriod,
            guild_id: channel.guild.id,
            max_members: maxMembers,
            pull_num: 1,
            queue_channel_id: channel.id,
         })
         .catch(() => null);
      if (channel.type === "GUILD_VOICE") {
         for await (const member of channel.members.filter((member) => !member.user.bot).array()) {
            await QueueMemberTable.store(channel, member);
         }
      }
      await Commands.display(parsed, channel);
   }

   public static async unstore(guildId: Snowflake, channelId?: Snowflake, parsed?: Parsed): Promise<void> {
      let query = Base.getKnex()<QueueChannel>("queue_channels").where("guild_id", guildId);
      // Delete role
      await this.deleteQueueRole(guildId, await query.first(), parsed);
      // Delete store db entries
      const channelIds: Snowflake[] = [];
      if (channelId) {
         query = query.where("queue_channel_id", channelId);
         channelIds.push(channelId);
      } else {
         channelIds.push(...(await query).map((entry) => entry.queue_channel_id));
      }

      for await (const channelId of channelIds) {
         await BlackWhiteListTable.unstore(2, channelId);
         await DisplayChannelTable.unstore(channelId);
         await QueueMemberTable.unstore(guildId, channelId);
      }
      await query.delete();
   }
}
