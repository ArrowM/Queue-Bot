import { Guild, GuildChannel, Message, MessageEmbed, Snowflake, TextChannel } from "discord.js";
import { Base } from "../utilities/Base";
import { AdminPermission, BlackWhiteListEntry, DisplayChannel, QueueChannel, QueueGuild } from "../utilities/Interfaces";
import { ApplicationOptions, Client as SlashClient } from "discord-slash-commands-client";
import { exists, readFileSync, writeFileSync } from "fs";
import delay from "delay";
import schemaInspector from "knex-schema-inspector";
import { QueueChannelTable } from "../utilities/tables/QueueChannelTable";
import { DisplayChannelTable } from "../utilities/tables/DisplayChannelTable";
import { MessagingUtils } from "../utilities/MessagingUtils";

interface PatchNote {
   sent: boolean;
   date: Date;
   embeds: MessageEmbed[];
}

export class PatchingUtil {
   public static async run() {
      await this.tableBlackWhiteList();
      await this.tableAdminPermission();
      await this.tableDisplayChannels();
      await this.tableQueueChannels();
      await this.tableQueueGuilds();
      await this.tableQueueMembers();
      await this.checkPatchNotes();
   }

   private static async checkPatchNotes() {
      const displayChannels: TextChannel[] = [];
      exists("../patch_notes/patch_notes.json", async (exists) => {
         if (!exists) return;
         // Collect notes
         const patchNotes: PatchNote[] = JSON.parse(readFileSync("../patch_notes/patch_notes.json", "utf8"));
         // Collect channel destinations
         for await (const guild of Base.getClient().guilds.cache.array()) {
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
         }
         let sentNote = false;
         const failedChannelIds: Snowflake[] = [];
         // Send notes
         for await (const patchNote of patchNotes.filter((p) => !p.sent)) {
            for await (const displayChannel of displayChannels) {
               try {
                  await displayChannel.send({ embeds: patchNote.embeds });
                  console.log("Sent to " + displayChannel.id);
               } catch (e) {
                  failedChannelIds.push(displayChannel.id);
                  console.error(e);
               }
               await delay(50);
            }
            const announcementChannel = (await Base.getClient()
               .channels.fetch(Base.getConfig().announcementChannelId)
               .catch(() => null)) as TextChannel;
            await announcementChannel.send({ embeds: patchNote.embeds }).catch(() => null);
            patchNote.sent = sentNote = true;
         }
         if (sentNote) {
            writeFileSync("../patch_notes/patch_notes.json", JSON.stringify(patchNotes, null, 3));
            this.slashCommands();
         }
         if (failedChannelIds.length) {
            console.log("FAILED TO SEND TO THE FOLLOWING CHANNEL IDS:");
            console.log(failedChannelIds);
         }
      });
   }

   private static async slashCommands() {
      // --------- POPULATE GLOBAL COMMANDS ---------
      const commands: Map<string, ApplicationOptions> = new Map(JSON.parse(readFileSync("../config/commands-config.json", "utf8")));
      const slashClient = new SlashClient(Base.getConfig().token, Base.getConfig().clientId);
      for await (const command of commands.values()) {
         await slashClient.createCommand(command).catch(console.error);
         await delay(5000);
      }

      // --------- DELETE LOCAL DEV SERVER COMMANDS ---------
      //let localCommands = (await this.slashClient.getCommands({ guildID: "719950919768342529" })) as ApplicationCommand[];
      //for await (const cmd of localCommands) {
      //   console.log("deleting: " + cmd.name);
      //   await this.slashClient.deleteCommand(cmd.id, "719950919768342529").catch(console.error);
      //   await delay(5000);
      //}

      // --------- DELETE GLOBAL COMMANDS ---------
      //globalCommands = (await this.slashClient.getCommands({})) as ApplicationCommand[];
      //for await (const cmd of globalCommands) {
      //   console.log("deleting: " + cmd.name);
      //   await this.slashClient.deleteCommand(cmd.id).catch(console.error);
      //   await delay(5000);
      //}
      console.log("Finished registering commands.");
   }

   private static async tableAdminPermission(): Promise<void> {
      if (await Base.getKnex().schema.hasTable("queue_manager_roles")) {
         // RENAME
         await Base.getKnex().schema.renameTable("queue_manager_roles", "admin_permission");

         await Base.getKnex().schema.alterTable("admin_permission", (table) => {
            // NEW COLUMNS
            table.renameColumn("role_name", "role_member_id");
            table.boolean("is_role");
            // MODIFY DATA TYPES
            table.bigInteger("guild_id").alter();
            table.bigInteger("role_member_id").alter();
         });

         // Update data for new columns
         const entries = await Base.getKnex()<AdminPermission>("admin_permission");
         for await (const entry of entries) {
            const guild = await Base.getClient()
               .guilds.fetch(entry.guild_id)
               .catch(() => null as Guild);
            if (!guild) continue;

            let newId: Snowflake;
            let isRole = false;
            if (entry.role_member_id.startsWith("<@")) {
               // USER
               const id = entry.role_member_id.replace(/\D/g, "") as Snowflake;
               if (guild.members.cache.has(id)) newId = id;
            } else {
               // ROLE
               newId = guild.roles.cache.find((role) => role.name === entry.role_member_id).id;
               isRole = true;
            }
            if (newId) {
               await Base.getKnex()<AdminPermission>("admin_permission")
                  .where("id", entry.id)
                  .first()
                  .update("role_member_id", newId)
                  .update("is_role", isRole);
            } else {
               await Base.getKnex()<AdminPermission>("admin_permission").where("id", entry.id).first().delete();
            }
         }
      }
   }

   private static async tableBlackWhiteList(): Promise<void> {
      if (await Base.getKnex().schema.hasTable("member_perms")) {
         // RENAME
         await Base.getKnex().schema.renameTable("member_perms", "black_white_list");

         await Base.getKnex().schema.alterTable("black_white_list", (table) => {
            // NEW COLUMNS
            table.renameColumn("perm", "type");
            table.renameColumn("role_member_id", "role_member_id");
            table.boolean("is_role");
            // MODIFY DATA TYPES
            table.bigInteger("queue_channel_id").alter();
            table.bigInteger("role_member_id").alter();
         });

         // Update data for new columns
         await Base.getKnex()<BlackWhiteListEntry>("black_white_list").update("is_role", false);
      }
   }

   private static async tableDisplayChannels(): Promise<void> {
      // Migration of embed_id to embed_ids
      if (await Base.getKnex().schema.hasColumn("display_channels", "embed_id")) {
         await Base.getKnex().schema.alterTable("display_channels", (table) => {
            // NEW COLUMNS
            table.specificType("embed_ids", "text ARRAY");
            // MODIFY DATA TYPES
            table.bigInteger("queue_channel_id").alter();
            table.bigInteger("display_channel_id").alter();
         });

         (await Base.getKnex()<DisplayChannel>("display_channels")).forEach(async (displayChannel) => {
            await Base.getKnex()<DisplayChannel>("display_channels")
               .where("queue_channel_id", displayChannel.queue_channel_id)
               .where("display_channel_id", displayChannel.display_channel_id)
               .update("embed_ids", [displayChannel["embed_id"]]);
         });
         await Base.getKnex().schema.table("display_channels", (table) => table.dropColumn("embed_id"));
      }
      // Migration from embed_ids to message_id
      if (await Base.getKnex().schema.hasColumn("display_channels", "embed_ids")) {
         await Base.getKnex().schema.alterTable("display_channels", (table) => table.bigInteger("message_id"));
         for await (const entry of await Base.getKnex()<DisplayChannel>("display_channels")) {
            const displayChannel = (await Base.getClient()
               .channels.fetch(entry.display_channel_id)
               .catch(() => null)) as TextChannel;
            const queueChannel = (await Base.getClient()
               .channels.fetch(entry.queue_channel_id)
               .catch(() => null)) as GuildChannel;
            if (!displayChannel || !queueChannel) continue;
            const embedIds = entry["embed_ids"] as Snowflake[];
            const messages: Message[] = [];
            const embeds: MessageEmbed[] = [];
            for (const embedId of embedIds) {
               const message = await displayChannel.messages.fetch(embedId).catch(() => null);
               if (!message) continue;
               messages.push(message);
               embeds.push(message.embeds[0]);
            }
            const response = await messages
               .shift()
               .edit({ embeds: embeds, components: MessagingUtils.getButton(queueChannel), allowedMentions: { users: [] } })
               .catch(() => null as Message);
            await Base.getKnex()<DisplayChannel>("display_channels")
               .where("queue_channel_id", entry.queue_channel_id)
               .where("display_channel_id", entry.display_channel_id)
               .update("message_id", response.id);
            // Reset nickname
            await displayChannel.guild.me.setNickname("Queue Bot").catch(() => null);
            await delay(1100);
         }
         await Base.getKnex().schema.alterTable("display_channels", (table) => table.dropColumn("embed_ids"));
      }
   }

   private static async tableQueueChannels(): Promise<void> {
      // Add max_members
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "max_members"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.text("max_members"));
      }
      // Add target_channel_id
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "target_channel_id"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.text("target_channel_id"));
      }
      // Add auto_fill
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "auto_fill"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.integer("auto_fill"));
         await Base.getKnex()<QueueChannel>("queue_channels").update("auto_fill", 1);
      }
      // Add pull_num
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "pull_num"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.integer("pull_num"));
         await Base.getKnex()<QueueChannel>("queue_channels").update("pull_num", 1);
      }
      // Add header
      if (!(await Base.getKnex().schema.hasColumn("queue_channels", "header"))) {
         await Base.getKnex().schema.table("queue_channels", (table) => table.text("header"));
      }

      const inspector = schemaInspector(Base.getKnex());
      if ((await inspector.columnInfo("queue_channels", "queue_channel_id")).data_type === "GUILD_TEXT") {
         await Base.getKnex().schema.alterTable("queue_channels", (table) => {
            // MODIFY DATA TYPES
            table.bigInteger("guild_id").alter();
            table.integer("max_members").alter();
            table.bigInteger("target_channel_id").alter();
         });
      }
   }

   private static async tableQueueGuilds(): Promise<void> {
      // Migration of msg_on_update to msg_mode
      if (await Base.getKnex().schema.hasColumn("queue_guilds", "msg_on_update")) {
         await Base.getKnex().schema.table("queue_guilds", (table) => table.integer("msg_mode"));
         (await Base.getKnex()<QueueGuild>("queue_guilds")).forEach(async (queueGuild) => {
            await Base.getKnex()<QueueGuild>("queue_guilds")
               .where("guild_id", queueGuild.guild_id)
               .update("msg_mode", queueGuild["msg_on_update"] ? 2 : 1);
         });
         await Base.getKnex().schema.table("queue_guilds", (table) => table.dropColumn("msg_on_update"));
      }
      // Add cleanup_commands
      if (!(await Base.getKnex().schema.hasColumn("queue_guilds", "cleanup_commands"))) {
         await Base.getKnex().schema.table("queue_guilds", (table) => table.text("cleanup_commands"));
         await Base.getKnex()<QueueGuild>("queue_guilds").update("cleanup_commands", "off");
      }
      // Move columns to channel table
      if (await Base.getKnex().schema.hasColumn("queue_guilds", "color")) {
         if (!(await Base.getKnex().schema.hasColumn("queue_channels", "color"))) {
            await Base.getKnex().schema.table("queue_channels", (table) => table.text("color"));
         }
         if (!(await Base.getKnex().schema.hasColumn("queue_channels", "grace_period"))) {
            await Base.getKnex().schema.table("queue_channels", (table) => table.integer("grace_period"));
         }

         const entries = await Base.getKnex()<QueueGuild & { color: string; grace_period: number }>("queue_guilds");
         for await (const entry of entries) {
            await Base.getKnex()<QueueChannel>("queue_channels")
               .where("guild_id", entry.guild_id)
               .update("color", entry.color)
               .update("grace_period", entry.grace_period);
         }

         await Base.getKnex().schema.alterTable("queue_guilds", (table) => {
            // DROP TABLES
            table.dropColumn("grace_period");
            table.dropColumn("color");
            table.dropColumn("cleanup_commands");
         });
      }
   }

   private static async tableQueueMembers(): Promise<void> {
      const inspector = schemaInspector(Base.getKnex());
      if ((await inspector.columnInfo("queue_members", "channel_id")).data_type === "GUILD_TEXT") {
         await Base.getKnex().schema.alterTable("queue_members", (table) => {
            table.renameColumn("queue_channel_id", "channel_id");
            table.renameColumn("queue_member_id", "member_id");
            // MODIFY DATA TYPES
            table.bigInteger("channel_id").alter();
            table.bigInteger("member_id").alter();
            table.boolean("priority");
         });
      }
   }
}
