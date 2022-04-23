import { Collection, Guild, Message, MessageEmbed, Snowflake, TextChannel } from "discord.js";
import { Base } from "./Base";
import {
  AdminPermission,
  BlackWhiteListEntry,
  DisplayChannel,
  StoredQueue,
  StoredGuild,
  QueueMember,
  Schedule,
  ScheduleCommand,
} from "./Interfaces";
import { existsSync, writeFileSync } from "fs";
import delay from "delay";
import schemaInspector from "knex-schema-inspector";
import { QueueTable } from "./tables/QueueTable";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { MessagingUtils } from "./MessagingUtils";
import { AdminPermissionTable } from "./tables/AdminPermissionTable";
import { BlackWhiteListTable } from "./tables/BlackWhiteListTable";
import { PriorityTable } from "./tables/PriorityTable";
import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";
import _ from "lodash";
import { ApplicationCommand } from "discord-slash-commands-client";
import { SlashCommands } from "./SlashCommands";
import { ScheduleTable } from "./tables/ScheduleTable";

interface Note {
  sent: boolean;
  date: Date;
  embeds: MessageEmbed[];
}

export class PatchingUtils {
  public static async run(guilds: Collection<Snowflake, Guild>) {
    await this.initTables();
    await this.tableBlackWhiteList();
    await this.tableQueueMembers();
    await this.tableQueueChannels();
    await this.tableAdminPermission();
    await this.tableDisplayChannels();
    await this.tableQueueGuilds();
    await this.tableSchedules();
    this.checkCommandsFile(guilds).then();
  }

  private static async checkCommandsFile(guilds: Collection<Snowflake, Guild>) {
    if (Base.haveCommandsChanged()) {
      let addedCommands = Base.commands.filter((c) => _.findIndex(Base.lastCommands, c) === -1);
      let addedNames = addedCommands.map((c) => c.name);
      let removedCommands = Base.lastCommands.filter(
        (c) => _.findIndex(Base.commands, c) === -1 && !addedNames.includes(c.name)
      );
      let removedNames = removedCommands.map((c) => c.name);

      if (addedNames.length) {
        console.log("commands-config.json has changed. Added/Updated: " + addedNames.join(", "));
      }
      if (removedNames.length) {
        console.log("commands-config.json has changed. Removed: " + removedNames.join(", "));
      }

      for await (let cmd of addedCommands) {
        let progressCnt = 0;
        if (SlashCommands.GLOBAL_COMMANDS.includes(cmd.name)) {
          await SlashCommands.slashClient.createCommand(cmd).catch(() => null);
        } else {
          console.log(`Adding [${cmd.name}] [1 / ${guilds.size}]`);
          for await (const guild of guilds.values()) {
            await SlashCommands.addCommandForGuild(guild, cmd).catch(() => null);
            if (++progressCnt % 50 === 0) {
              console.log(`Adding [${cmd.name}] [${progressCnt} / ${guilds.size}]`);
            }
            await delay(100);
          }
          console.log(`Added [${cmd.name}] [${progressCnt} / ${guilds.size}]`);
        }
        await delay(5000);
      }
      for await (const cmd of removedCommands) {
        let progressCnt = 0;
        if (SlashCommands.GLOBAL_COMMANDS.includes(cmd.name)) {
          const globalCommand = (
            (await SlashCommands.slashClient.getCommands().catch(() => [])) as ApplicationCommand[]
          ).find((c) => c.name === cmd.name);
          if (globalCommand) {
            await SlashCommands.slashClient.deleteCommand(globalCommand.id).catch(() => null);
          }
        } else {
          console.log(`Removing [${cmd.name}] [1 / ${guilds.size}]`);
          for await (const guild of guilds.values()) {
            const guildCommands = (await SlashCommands.slashClient
              .getCommands({
                guildID: guild.id,
              })
              .catch(() => [])) as ApplicationCommand[];
            const c = guildCommands.find((c) => c.name === cmd.name);
            if (c) {
              await SlashCommands.slashClient.deleteCommand(c.id, guild.id).catch(() => null);
              await delay(100);
            }
          }
          if (++progressCnt % 50 === 0) {
            console.log(`Removing [${cmd.name}] [${progressCnt} / ${guilds.size}]`);
          }
        }
        console.log(`Removed [${cmd.name}] [${progressCnt} / ${guilds.size}]`);
        await delay(5000);
      }
      console.log("Done updating commands for command-config.json change.");
      await Base.archiveCommands();
    }
    await this.checkNotes(guilds);
  }

  private static async checkNotes(guilds: Collection<Snowflake, Guild>) {
    const displayChannels: TextChannel[] = [];
    if (existsSync("../patch_notes/patch_notes.json")) {
      // Collect notes
      const notes = Base.getJSON("../patch_notes/patch_notes.json") as Note[];
      const notesToSend = notes.filter((p) => !p.sent);
      if (!notesToSend?.length) {
        return;
      }
      // Collect channel destinations
      for await (const guild of guilds.values()) {
        try {
          const queueChannelId = (await QueueTable.fetchFromGuild(guild)).first()?.id;
          if (!queueChannelId) {
            continue;
          }

          const storedDisplays = await DisplayChannelTable.getFromQueue(queueChannelId);
          if (!storedDisplays.length) {
            continue;
          }
          const displayChannelId = storedDisplays[storedDisplays.length - 1]?.display_channel_id;
          if (!displayChannelId) {
            continue;
          }

          const displayChannel = (await guild.channels.fetch(displayChannelId).catch(() => null)) as TextChannel;
          if (!displayChannel) {
            continue;
          }

          displayChannels.push(displayChannel);
        } catch (e: any) {
          // Empty
        }
        await delay(100);
      }

      let sentNote = false;
      const failedChannelIds: Snowflake[] = [];
      let i = 0;
      // Send notes
      for await (const note of notesToSend) {
        for await (const displayChannel of displayChannels) {
          if (!note.embeds) {
            continue;
          }
          try {
            await displayChannel.send({ embeds: note.embeds });
            // console.log("Sent to " + displayChannel.id);
          } catch (e: any) {
            failedChannelIds.push(displayChannel.id);
            // console.error(e);
          }
          await delay(100);

          if (++i % 20 === 0) {
            console.log(`Patching progress: ${i}/${displayChannels.length * notesToSend.length}`);
          }
        }

        // SUPPORT SERVER
        const announcementChannel = (await Base.client.channels
          .fetch(Base.config.announcementChannelId)
          .catch(() => null)) as TextChannel;
        if (announcementChannel) {
          await announcementChannel.send({ embeds: note.embeds }).catch(() => null);
        }
        note.sent = true;
        sentNote = true;
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

  private static async initTables() {
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
      await QueueTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("queue_guilds"))) {
      await QueueGuildTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("queue_members"))) {
      await QueueMemberTable.initTable();
    }
    if (!(await Base.knex.schema.hasTable("schedules"))) {
      await ScheduleTable.initTable();
    }
  }

  private static async tableAdminPermission() {
    if (await Base.knex.schema.hasTable("queue_manager_roles")) {
      // RENAME
      await Base.knex.schema.renameTable("queue_manager_roles", "admin_permission");
      await Base.knex.schema.raw("ALTER SEQUENCE queue_manager_roles_id_seq RENAME TO admin_permission_id_seq");
      await delay(1000);
      await Base.knex.schema.alterTable("admin_permission", (t) => {
        // NEW COLUMNS
        t.renameColumn("role_name", "role_member_id");
        t.boolean("is_role");
      });

      // Update data for new columns
      const entries = await Base.knex<AdminPermission>("admin_permission");
      console.log("Admin Table updates");
      for await (const entry of entries) {
        try {
          const guild = await Base.client.guilds.fetch(entry.guild_id).catch(() => null as Guild);
          if (!guild) {
            throw "GUILD NOT FOUND";
          }

          let newId: Snowflake;
          let isRole = false;
          if (entry.role_member_id.startsWith("<@")) {
            // USER
            const id = entry.role_member_id.replace(/\D/g, "") as Snowflake;
            const member = await guild.members.fetch(id).catch(() => null);
            if (member) {
              newId = id;
            }
          } else {
            // ROLE
            await guild.roles.fetch();
            newId = guild.roles.cache.find((role) => role.name === entry.role_member_id)?.id;
            isRole = true;
          }
          if (!newId) {
            throw "ID NOT FOUND";
          }
          await Base.knex<AdminPermission>("admin_permission")
            .where("id", entry.id)
            .update("role_member_id", newId)
            .update("is_role", isRole);
        } catch (e: any) {
          await Base.knex<AdminPermission>("admin_permission").where("id", entry.id).first().delete();
        }
        await delay(40);
      }
      await Base.knex.schema.alterTable("admin_permission", (t) => {
        // MODIFY DATA TYPES
        t.bigInteger("guild_id").alter({});
        t.bigInteger("role_member_id").alter({});
      });
    }
  }

  private static async tableBlackWhiteList() {
    if (await Base.knex.schema.hasTable("member_perms")) {
      // RENAME
      await Base.knex.schema.renameTable("member_perms", "black_white_list");
      await Base.knex.schema.raw("ALTER SEQUENCE member_perms_id_seq RENAME TO black_white_list_id_seq");
      await delay(100);
      await Base.knex.schema.alterTable("black_white_list", (t) => {
        // NEW COLUMNS
        t.renameColumn("perm", "type");
        t.renameColumn("member_id", "role_member_id");
        t.boolean("is_role");
      });
      await Base.knex.schema.alterTable("black_white_list", (t) => {
        // MODIFY DATA TYPES
        t.bigInteger("queue_channel_id").alter({});
        t.bigInteger("role_member_id").alter({});
      });

      // Update data for new columns
      await Base.knex<BlackWhiteListEntry>("black_white_list").update("is_role", false);
    }
  }

  private static async tableDisplayChannels() {
    // Migration of embed_id to embed_ids
    if (await Base.knex.schema.hasColumn("display_channels", "embed_id")) {
      await Base.knex.schema.alterTable("display_channels", (t) => {
        // NEW COLUMNS
        t.specificType("embed_ids", "text ARRAY");
      });
      await Base.knex.schema.alterTable("display_channels", (t) => {
        // MODIFY DATA TYPES
        t.bigInteger("queue_channel_id").alter({});
        t.bigInteger("display_channel_id").alter({});
      });

      for await (const displayChannel of await Base.knex<DisplayChannel>("display_channels")) {
        await Base.knex<DisplayChannel>("display_channels")
          .where("queue_channel_id", displayChannel.queue_channel_id)
          .where("display_channel_id", displayChannel.display_channel_id)
          .update("embed_ids", [displayChannel["embed_id"]]);
      }
      await Base.knex.schema.table("display_channels", (t) => t.dropColumn("embed_id"));
    }
    // Migration from embed_ids to message_id
    if (await Base.knex.schema.hasColumn("display_channels", "embed_ids")) {
      await Base.knex.schema.alterTable("display_channels", (t) => t.bigInteger("message_id"));
      console.log("Display Channel updates");
      for await (const entry of await Base.knex<DisplayChannel>("display_channels")) {
        const displayChannel = (await Base.client.channels
          .fetch(entry.display_channel_id)
          .catch(() => null)) as TextChannel;
        const queueChannel = await Base.client.channels.fetch(entry.queue_channel_id).catch(() => null);
        if (!displayChannel || !queueChannel) {
          continue;
        }
        const embedIds = entry["embed_ids"] as Snowflake[];
        const messages: Message[] = [];
        const embeds: MessageEmbed[] = [];
        for await (const embedId of embedIds) {
          const message = await displayChannel.messages.fetch(embedId).catch(() => null);
          await delay(40);
          if (!message) {
            continue;
          }
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
      await Base.knex.schema.alterTable("display_channels", (t) => t.dropColumn("embed_ids"));
      // ALSO do some 1 time updates for slash commands and nicknames
      this.setNickNames().then();
    }
  }

  private static async setNickNames() {
    for await (const entry of await Base.knex<StoredGuild>("queue_guilds")) {
      const guild = await Base.client.guilds.fetch(entry.guild_id).catch(() => null as Guild);
      if (!guild) {
        continue;
      }

      await guild.me.setNickname("Queue Bot").catch(() => null);
      await delay(1100);
    }
  }

  private static async tableQueueChannels() {
    // Add max_members
    if (!(await Base.knex.schema.hasColumn("queue_channels", "max_members"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.text("max_members"));
    }
    // Add target_channel_id
    if (!(await Base.knex.schema.hasColumn("queue_channels", "target_channel_id"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.text("target_channel_id"));
    }
    // Add auto_fill
    if (!(await Base.knex.schema.hasColumn("queue_channels", "auto_fill"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.integer("auto_fill"));
      await Base.knex<StoredQueue>("queue_channels").update("auto_fill", 1);
    }
    // Add pull_num
    if (!(await Base.knex.schema.hasColumn("queue_channels", "pull_num"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.integer("pull_num"));
      await Base.knex<StoredQueue>("queue_channels").update("pull_num", 1);
    }
    // Add header
    if (!(await Base.knex.schema.hasColumn("queue_channels", "header"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.text("header"));
    }

    const inspector = schemaInspector(Base.knex);
    if ((await inspector.columnInfo("queue_channels", "queue_channel_id")).data_type === "GUILD_TEXT") {
      await Base.knex.schema.alterTable("queue_channels", (t) => {
        // MODIFY DATA TYPES
        t.bigInteger("guild_id").alter({});
        t.integer("max_members").alter({});
        t.bigInteger("target_channel_id").alter({});
      });
    }
    // Add Role ID column
    if (!(await Base.knex.schema.hasColumn("queue_channels", "role_id"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.bigInteger("role_id"));
    }
    // Add hide button column
    if (!(await Base.knex.schema.hasColumn("queue_channels", "hide_button"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.boolean("hide_button"));
    }
    // Add is_locked column
    if (!(await Base.knex.schema.hasColumn("queue_channels", "is_locked"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.boolean("is_locked"));
    }
    // Add enable_partial_pull
    if (!(await Base.knex.schema.hasColumn("queue_channels", "enable_partial_pull"))) {
      await Base.knex.schema.table("queue_channels", (t) => t.boolean("enable_partial_pull"));
      for await (const entry of await Base.knex<StoredQueue>("queue_channels")) {
        await Base.knex<DisplayChannel>("queue_channels").where("id", entry.id).update("enable_partial_pull", true);
      }
    }
    // Migrate clear_schedule & clearTimezone to schedule table
    if (await Base.knex.schema.hasColumn("queue_channels", "clear_schedule")) {
      await this.tableSchedules();
      const entries = await Base.knex<StoredQueue & { clear_schedule: string; clear_utc_offset: string }>(
        "queue_channels"
      ).whereNotNull("clear_schedule");
      for await (let entry of entries) {
        await Base.knex<Schedule>("schedules")
          .insert({
            queue_channel_id: entry.queue_channel_id,
            command: ScheduleCommand.CLEAR,
            schedule: entry.clear_schedule,
            utc_offset: +entry.clear_utc_offset,
          })
          .catch(() => null);
      }
      await Base.knex.schema.alterTable("queue_channels", (t) => t.dropColumn("clear_schedule"));
    }
  }

  private static async tableQueueGuilds() {
    // Migration of msg_on_update to msg_mode
    if (await Base.knex.schema.hasColumn("queue_guilds", "msg_on_update")) {
      await Base.knex.schema.table("queue_guilds", (t) => t.integer("msg_mode"));
      for await (const storedGuild of await Base.knex<StoredGuild>("queue_guilds")) {
        await Base.knex<StoredGuild>("queue_guilds")
          .where("guild_id", storedGuild.guild_id)
          .update("msg_mode", storedGuild["msg_on_update"] ? 2 : 1);
      }
      await Base.knex.schema.table("queue_guilds", (t) => t.dropColumn("msg_on_update"));
    }
    // Add cleanup_commands
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "cleanup_commands"))) {
      await Base.knex.schema.table("queue_guilds", (t) => t.text("cleanup_commands"));
      await Base.knex<StoredGuild>("queue_guilds").update("cleanup_commands", "off");
    }
    // Move columns to channel t
    if (await Base.knex.schema.hasColumn("queue_guilds", "color")) {
      if (!(await Base.knex.schema.hasColumn("queue_channels", "color"))) {
        await Base.knex.schema.table("queue_channels", (t) => t.text("color"));
      }
      if (!(await Base.knex.schema.hasColumn("queue_channels", "grace_period"))) {
        await Base.knex.schema.table("queue_channels", (t) => t.integer("grace_period"));
      }

      const entries = await Base.knex<StoredGuild & { color: string; grace_period: number }>("queue_guilds");
      console.log("Migrate QueueGuilds to QueueChannels");
      for await (const entry of entries) {
        await Base.knex<StoredQueue>("queue_channels")
          .where("guild_id", entry.guild_id)
          .update("color", entry.color)
          .update("grace_period", entry.grace_period);
        await delay(40);
      }

      await Base.knex.schema.alterTable("queue_guilds", (t) => {
        // DROP TABLES
        t.dropColumn("grace_period");
        t.dropColumn("color");
        t.dropColumn("cleanup_commands");
      });
    }
    // add enable_alt_prefix
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "enable_alt_prefix"))) {
      await Base.knex.schema.alterTable("queue_guilds", (t) => t.boolean("enable_alt_prefix"));
    }
    // add disable_mentions
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "disable_mentions"))) {
      await Base.knex.schema.table("queue_guilds", (t) => t.boolean("disable_mentions"));
    }
    // Add disable_roles
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "disable_roles"))) {
      await Base.knex.schema.table("queue_guilds", (t) => t.boolean("disable_roles"));
    }
    // Add disable_notifications
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "disable_notifications"))) {
      await Base.knex.schema.table("queue_guilds", (t) => t.boolean("disable_notifications"));
    }
    // add timestamps column
    if (!(await Base.knex.schema.hasColumn("queue_guilds", "timestamps"))) {
      await Base.knex.schema.alterTable("queue_guilds", (t) => t.text("timestamps").defaultTo("off"));
      // Initialize timestamps
      for await (const entry of await Base.knex<StoredGuild & { enable_timestamps: string }>("queue_guilds")) {
        await Base.knex<StoredGuild>("queue_guilds")
          .where("guild_id", entry.guild_id)
          .update("timestamps", entry.enable_timestamps ? "time" : "off");
      }
      // Delete enable_timestamps
      if (await Base.knex.schema.hasColumn("queue_guilds", "enable_timestamps")) {
        await Base.knex.schema.alterTable("queue_guilds", (t) => t.dropColumn("enable_timestamps"));
      }
    }
  }

  private static async tableQueueMembers() {
    if (await Base.knex.schema.hasColumn("queue_members", "queue_channel_id")) {
      await Base.knex.schema.alterTable("queue_members", (t) => {
        // NEW COLUMNS
        t.renameColumn("queue_channel_id", "channel_id");
        t.renameColumn("queue_member_id", "member_id");
        t.boolean("is_priority");
      });
      await Base.knex.schema.alterTable("queue_members", (t) => {
        // MODIFY DATA TYPES
        t.bigInteger("channel_id").alter({});
        t.bigInteger("member_id").alter({});
      });
    }
    // add display_time
    if (!(await Base.knex.schema.hasColumn("queue_members", "display_time"))) {
      await Base.knex.schema.alterTable("queue_members", (t) =>
        t.timestamp("display_time").defaultTo(Base.knex.fn.now())
      );
      // Initialize display_time
      for await (const entry of await Base.knex<QueueMember>("queue_members")) {
        await Base.knex<QueueMember>("queue_members").where("id", entry.id).update("display_time", entry.created_at);
      }
    }
  }

  private static async tableSchedules() {}
}
