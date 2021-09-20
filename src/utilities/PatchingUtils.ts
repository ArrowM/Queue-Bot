import { Guild, GuildChannel, Message, MessageEmbed, Snowflake, TextChannel } from "discord.js";
import { Base } from "./Base";
import { AdminPermission, BlackWhiteListEntry, DisplayChannel, QueueChannel, QueueGuild } from "./Interfaces";
import { existsSync, readFileSync, writeFileSync } from "fs";
import delay from "delay";
import schemaInspector from "knex-schema-inspector";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { MessagingUtils } from "./MessagingUtils";
import { AdminPermissionTable } from "./tables/AdminPermissionTable";
import { BlackWhiteListTable } from "./tables/BlackWhiteListTable";
import { PriorityTable } from "./tables/PriorityTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";

interface note {
  sent: boolean;
  date: Date;
  embeds: MessageEmbed[];
}

export class PatchingUtils {
  public static async run(guilds: Guild[]) {
    await this.initTables();
    await this.tableBlackWhiteList();
    await this.tableQueueMembers();
    await this.tableQueueChannels();
    await this.tableAdminPermission();
    await this.tableDisplayChannels();
    await this.tableQueueGuilds();
    this.checknotes(guilds).then();
  }

  private static async checknotes(guilds: Guild[]) {
    const displayChannels: TextChannel[] = [];
    if (existsSync("../patch_notes/patch_notes.json")) {
      // Collect notes
      const notes: note[] = JSON.parse(readFileSync("../patch_notes/patch_notes.json", "utf8"));
      const notesToSend = notes.filter((p) => !p.sent);
      if (!notesToSend?.length) return;
      // Collect channel destinations
      for await (const guild of guilds) {
        await guild.channels.fetch(); // Avoid rate limits
        try {
          const queueChannelId = (await QueueChannelTable.fetchFromGuild(guild))[0]?.id;
          if (!queueChannelId) continue;

          const displayChannelId = (await DisplayChannelTable.getFromQueue(queueChannelId).first())?.display_channel_id;
          if (!displayChannelId) continue;

          const displayChannel = (await guild.channels.fetch(displayChannelId).catch(() => null)) as TextChannel;
          if (!displayChannel) continue;

          displayChannels.push(displayChannel);
        } catch (e) {
          // Empty
        }
        await delay(100);
      }
      let sentNote = false;
      const failedChannelIds: Snowflake[] = [];
      // Send notes
      for await (const note of notesToSend) {
        for await (const displayChannel of displayChannels) {
          if (!note.embeds) continue;
          try {
            await displayChannel.send({ embeds: note.embeds });
            console.log("Sent to " + displayChannel.id);
          } catch (e) {
            failedChannelIds.push(displayChannel.id);
            console.error(e);
          }
          await delay(100);
        }
        const announcementChannel = (await Base.client.channels
          .fetch(Base.config.announcementChannelId)
          .catch(() => null)) as TextChannel;
        if (announcementChannel) {
          await announcementChannel.send({ embeds: note.embeds }).catch(() => null);
        }
        note.sent = sentNote = true;
      }
      if (sentNote) {
        writeFileSync("../patch_notes/patch_notes.json", JSON.stringify(notes, null, 3));
      }
      if (failedChannelIds.length) {
        console.log("FAILED TO SEND TO THE FOLLOWING CHANNEL IDS:");
        console.log(failedChannelIds);
      }
    }
  }

  private static async initTables(): Promise<void> {
    if (!(await Base.knex.schema.hasTable("admin_permission"))) {
      await AdminPermissionTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("black_white_list"))) {
      await BlackWhiteListTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("display_channels"))) {
      await DisplayChannelTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("priority"))) {
      await PriorityTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("queue_channels"))) {
      await QueueChannelTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("queue_guilds"))) {
      await QueueGuildTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("queue_members"))) {
      await QueueMemberTable.initTable();
    }
  }

  private static async tableAdminPermission(): Promise<void> {
    if (await Base.knex.schema.hasTable("queue_manager_roles")) {
      // RENAME
      await Base.knex.schema.renameTable("queue_manager_roles", "admin_permission");
      await Base.knex.schema.raw("ALTER SEQUENCE queue_manager_roles_id_seq RENAME TO admin_permission_id_seq");
      await delay(1000);
      await Base.knex.schema.alterTable("admin_permission", (table) => {
        // NEW COLUMNS
        table.renameColumn("role_name", "role_member_id");
        table.boolean("is_role");
      });

      // Update data for new columns
      const entries = await Base.knex<AdminPermission>("admin_permission");
      console.log("Admin Table updates");
      for await (const entry of entries) {
        try {
          const guild = await Base.client.guilds.fetch(entry.guild_id).catch(() => null as Guild);
          if (!guild) throw "GUILD NOT FOUND";

          let newId: Snowflake;
          let isRole = false;
          if (entry.role_member_id.startsWith("<@")) {
            // USER
            const id = entry.role_member_id.replace(/\D/g, "") as Snowflake;
            const member = await guild.members.fetch(id).catch(() => null);
            if (member) newId = id;
          } else {
            // ROLE
            await guild.roles.fetch();
            newId = guild.roles.cache.find((role) => role.name === entry.role_member_id)?.id;
            isRole = true;
          }
          if (!newId) throw "ID NOT FOUND";
          await Base.knex<AdminPermission>("admin_permission")
            .where("id", entry.id)
            .update("role_member_id", newId)
            .update("is_role", isRole);
        } catch (e) {
          await Base.knex<AdminPermission>("admin_permission").where("id", entry.id).first().delete();
        }
        await delay(40);
      }
      await Base.knex.schema.alterTable("admin_permission", (table) => {
        // MODIFY DATA TYPES
        table.bigInteger("guild_id").alter();
        table.bigInteger("role_member_id").alter();
      });
    }
  }

  private static async tableBlackWhiteList(): Promise<void> {
    if (await Base.knex.schema.hasTable("member_perms")) {
      // RENAME
      await Base.knex.schema.renameTable("member_perms", "black_white_list");
      await Base.knex.schema.raw("ALTER SEQUENCE member_perms_id_seq RENAME TO black_white_list_id_seq");
      await delay(100);
      await Base.knex.schema.alterTable("black_white_list", (table) => {
        // NEW COLUMNS
        table.renameColumn("perm", "type");
        table.renameColumn("member_id", "role_member_id");
        table.boolean("is_role");
      });
      await Base.knex.schema.alterTable("black_white_list", (table) => {
        // MODIFY DATA TYPES
        table.bigInteger("queue_channel_id").alter();
        table.bigInteger("role_member_id").alter();
      });

      // Update data for new columns
      await Base.knex<BlackWhiteListEntry>("black_white_list").update("is_role", false);
    }
  }

  private static async tableDisplayChannels(): Promise<void> {
    // Migration of embed_id to embed_ids
    if (await Base.knex.schema.hasColumn("display_channels", "embed_id")) {
      await Base.knex.schema.alterTable("display_channels", (table) => {
        // NEW COLUMNS
        table.specificType("embed_ids", "text ARRAY");
      });
      await Base.knex.schema.alterTable("display_channels", (table) => {
        // MODIFY DATA TYPES
        table.bigInteger("queue_channel_id").alter();
        table.bigInteger("display_channel_id").alter();
      });

      (await Base.knex<DisplayChannel>("display_channels")).forEach(async (displayChannel) => {
        await Base.knex<DisplayChannel>("display_channels")
          .where("queue_channel_id", displayChannel.queue_channel_id)
          .where("display_channel_id", displayChannel.display_channel_id)
          .update("embed_ids", [displayChannel["embed_id"]]);
      });
      await Base.knex.schema.table("display_channels", (table) => table.dropColumn("embed_id"));
    }
    // Migration from embed_ids to message_id
    if (await Base.knex.schema.hasColumn("display_channels", "embed_ids")) {
      await Base.knex.schema.alterTable("display_channels", (table) => table.bigInteger("message_id"));
      console.log("Display Channel updates");
      for await (const entry of await Base.knex<DisplayChannel>("display_channels")) {
        const displayChannel = (await Base.client.channels
          .fetch(entry.display_channel_id)
          .catch(() => null)) as TextChannel;
        const queueChannel = (await Base.client.channels
          .fetch(entry.queue_channel_id)
          .catch(() => null)) as GuildChannel;
        if (!displayChannel || !queueChannel) continue;
        const embedIds = entry["embed_ids"] as Snowflake[];
        const messages: Message[] = [];
        const embeds: MessageEmbed[] = [];
        for await (const embedId of embedIds) {
          const message = await displayChannel.messages.fetch(embedId).catch(() => null);
          await delay(40);
          if (!message) continue;
          messages.push(message);
          embeds.push(message.embeds[0]);
        }
        const response = await messages[0]
          ?.edit({
            embeds: embeds,
            components: await MessagingUtils.getButton(queueChannel),
            allowedMentions: { users: [] },
          })
          .catch(() => null as Message);
        if (response) {
          await Base.knex<DisplayChannel>("display_channels").where("id", entry.id).update("message_id", response.id);
        } else {
          await Base.knex<DisplayChannel>("display_channels").where("id", entry.id).delete();
        }
        await delay(40);
      }
      await Base.knex.schema.alterTable("display_channels", (table) => table.dropColumn("embed_ids"));
      // ALSO do some 1 time updates for slash commands and nicknames
      this.setNickNames().then();
    }
  }

  private static async setNickNames() {
    for await (const entry of await Base.knex<QueueGuild>("queue_guilds")) {
      const guild = await Base.client.guilds.fetch(entry.guild_id).catch(() => null as Guild);
      if (!guild) continue;

      await guild.me.setNickname("Queue Bot").catch(() => null);
      await delay(1100);
    }
  }

  private static async tableQueueChannels(): Promise<void> {
    // Add max_members
    if (!(await Base.knex.schema.hasColumn("queue_channels", "max_members"))) {
      await Base.knex.schema.table("queue_channels", (table) => table.text("max_members"));
    }
    // Add target_channel_id
    if (!(await Base.knex.schema.hasColumn("queue_channels", "target_channel_id"))) {
      await Base.knex.schema.table("queue_channels", (table) => table.text("target_channel_id"));
    }
    // Add auto_fill
    if (!(await Base.knex.schema.hasColumn("queue_channels", "auto_fill"))) {
      await Base.knex.schema.table("queue_channels", (table) => table.integer("auto_fill"));
      await Base.knex<QueueChannel>("queue_channels").update("auto_fill", 1);
    }
    // Add pull_num
    if (!(await Base.knex.schema.hasColumn("queue_channels", "pull_num"))) {
      await Base.knex.schema.table("queue_channels", (table) => table.integer("pull_num"));
      await Base.knex<QueueChannel>("queue_channels").update("pull_num", 1);
    }
    // Add header
    if (!(await Base.knex.schema.hasColumn("queue_channels", "header"))) {
      await Base.knex.schema.table("queue_channels", (table) => table.text("header"));
    }

    const inspector = schemaInspector(Base.knex);
    if ((await inspector.columnInfo("queue_channels", "queue_channel_id")).data_type === "GUILD_TEXT") {
      await Base.knex.schema.alterTable("queue_channels", (table) => {
        // MODIFY DATA TYPES
        table.bigInteger("guild_id").alter();
        table.integer("max_members").alter();
        table.bigInteger("target_channel_id").alter();
      });
    }
    // Add Role ID column
    if (!(await Base.knex.schema.hasColumn("queue_channels", "role_id"))) {
      await Base.knex.schema.table("queue_channels", (table) => table.bigInteger("role_id"));
    }
    //
    if (!(await Base.knex.schema.hasColumn("queue_channels", "hide_button"))) {
      await Base.knex.schema.table("queue_channels", (table) => table.boolean("hide_button"));
    }
  }

  private static async tableQueueGuilds(): Promise<void> {
    // Migration of msg_on_update to msg_mode
    if (await Base.knex.schema.hasColumn("queue_guilds", "msg_on_update")) {
      await Base.knex.schema.table("queue_guilds", (table) => table.integer("msg_mode"));
      (await Base.knex<QueueGuild>("queue_guilds")).forEach(async (queueGuild) => {
        await Base.knex<QueueGuild>("queue_guilds")
          .where("guild_id", queueGuild.guild_id)
          .update("msg_mode", queueGuild["msg_on_update"] ? 2 : 1);
      });
      await Base.knex.schema.table("queue_guilds", (table) => table.dropColumn("msg_on_update"));
    }
    // Add cleanup_commands
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "cleanup_commands"))) {
      await Base.knex.schema.table("queue_guilds", (table) => table.text("cleanup_commands"));
      await Base.knex<QueueGuild>("queue_guilds").update("cleanup_commands", "off");
    }
    // Move columns to channel table
    if (await Base.knex.schema.hasColumn("queue_guilds", "color")) {
      if (!(await Base.knex.schema.hasColumn("queue_channels", "color"))) {
        await Base.knex.schema.table("queue_channels", (table) => table.text("color"));
      }
      if (!(await Base.knex.schema.hasColumn("queue_channels", "grace_period"))) {
        await Base.knex.schema.table("queue_channels", (table) => table.integer("grace_period"));
      }

      const entries = await Base.knex<QueueGuild & { color: string; grace_period: number }>("queue_guilds");
      console.log("Migrate QueueGuilds to QueueChannels");
      for await (const entry of entries) {
        await Base.knex<QueueChannel>("queue_channels")
          .where("guild_id", entry.guild_id)
          .update("color", entry.color)
          .update("grace_period", entry.grace_period);
        await delay(40);
      }

      await Base.knex.schema.alterTable("queue_guilds", (table) => {
        // DROP TABLES
        table.dropColumn("grace_period");
        table.dropColumn("color");
        table.dropColumn("cleanup_commands");
      });
    }
    //
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "enable_alt_prefix"))) {
      await Base.knex.schema.alterTable("queue_guilds", (t) => t.boolean("enable_alt_prefix"));
    }
    //
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "disable_mentions"))) {
      await Base.knex.schema.table("queue_guilds", (table) => table.boolean("disable_mentions"));
    }
  }

  private static async tableQueueMembers(): Promise<void> {
    if (await Base.knex.schema.hasColumn("queue_members", "queue_channel_id")) {
      await Base.knex.schema.alterTable("queue_members", (table) => {
        // NEW COLUMNS
        table.renameColumn("queue_channel_id", "channel_id");
        table.renameColumn("queue_member_id", "member_id");
        table.boolean("is_priority");
      });
      await Base.knex.schema.alterTable("queue_members", (table) => {
        // MODIFY DATA TYPES
        table.bigInteger("channel_id").alter();
        table.bigInteger("member_id").alter();
      });
    }
  }
}
