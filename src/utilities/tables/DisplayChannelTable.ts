import {
  Collection,
  Guild,
  GuildBasedChannel,
  Message,
  MessageEmbed,
  NonThreadGuildBasedChannel,
  Snowflake,
  TextChannel,
} from "discord.js";
import { DisplayChannel } from "../Interfaces";
import { Base } from "../Base";
import { MessagingUtils } from "../MessagingUtils";

export class DisplayChannelTable {
  /**
   * Create & update DisplayChannel database table if necessary
   */
  public static async initTable() {
    await Base.knex.schema.hasTable("display_channels").then(async (exists) => {
      if (!exists) {
        await Base.knex.schema
          .createTable("display_channels", (table) => {
            table.increments("id").primary();
            table.bigInteger("queue_channel_id");
            table.bigInteger("display_channel_id");
            table.bigInteger("message_id");
          })
          .catch((e) => console.error(e));
      }
    });
  }

  public static get(displayChannelId: Snowflake) {
    return Base.knex<DisplayChannel>("display_channels").where("display_channel_id", displayChannelId).first();
  }

  public static getFromQueue(queueChannelId: Snowflake) {
    return Base.knex<DisplayChannel>("display_channels").where("queue_channel_id", queueChannelId);
  }

  public static getFirstFromQueue(queueChannelId: Snowflake) {
    return Base.knex<DisplayChannel>("display_channels").where("queue_channel_id", queueChannelId).first();
  }

  public static getFromMessage(messageId: Snowflake) {
    return Base.knex<DisplayChannel>("display_channels").where("message_id", messageId).first();
  }

  public static async store(queueChannel: GuildBasedChannel, displayChannel: TextChannel, embeds: MessageEmbed[]) {
    const response = await displayChannel
      .send({
        embeds: embeds,
        components: await MessagingUtils.getButton(queueChannel),
        allowedMentions: { users: [] },
      })
      .catch(() => null as Message);
    if (!response) return;

    await Base.knex<DisplayChannel>("display_channels").insert({
      display_channel_id: displayChannel.id,
      message_id: response.id,
      queue_channel_id: queueChannel.id,
    });
  }

  public static async unstore(queueChannelId: Snowflake, displayChannelId?: Snowflake, deleteOldDisplays = true) {
    let query = Base.knex<DisplayChannel>("display_channels").where("queue_channel_id", queueChannelId);
    if (displayChannelId) query = query.where("display_channel_id", displayChannelId);
    const storedDisplays = await query;
    await query.delete();
    if (!storedDisplays) return;

    for await (const storedDisplay of storedDisplays) {
      const displayChannel = Base.client.channels.cache.get(storedDisplay.display_channel_id) as TextChannel;
      if (!displayChannel) continue;

      const displayMessage = await displayChannel.messages
        .fetch(storedDisplay.message_id, { cache: false })
        .catch(() => null as Message);
      if (!displayMessage) continue;

      if (deleteOldDisplays) {
        // Delete
        await displayMessage.delete().catch(() => null);
      } else {
        // Remove button
        await displayMessage.edit({ embeds: displayMessage.embeds, components: [] }).catch(() => null);
      }
    }
  }

  public static async validate(
    guild: Guild,
    queueChannel: GuildBasedChannel,
    channels: Collection<Snowflake, NonThreadGuildBasedChannel>
  ): Promise<boolean> {
    let updateRequired = false;
    const storedEntries = await this.getFromQueue(queueChannel.id);
    for await (const entry of storedEntries) {
      if (channels.some((c) => c.id === entry.display_channel_id)) {
        Base.client.guilds.cache
          .get(guild.id)
          .channels.cache.set(entry.display_channel_id, channels.get(entry.display_channel_id)); // cache
      } else {
        await this.unstore(queueChannel.id, entry.display_channel_id);
        updateRequired = true;
      }
    }
    return updateRequired;
  }
}
