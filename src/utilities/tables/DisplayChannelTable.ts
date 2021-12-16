import {
  GuildChannel,
  Message,
  MessageEmbed,
  Snowflake,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from "discord.js";
import { DisplayChannel } from "../Interfaces";
import { Base } from "../Base";
import { MessagingUtils } from "../MessagingUtils";

export class DisplayChannelTable {
  /**
   * Create & update DisplayChannel database table if necessary
   */
  public static async initTable(): Promise<void> {
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
    return Base.knex<DisplayChannel>("display_channels")
      .where("display_channel_id", displayChannelId)
      .first();
  }

  public static getFromQueue(queueChannelId: Snowflake) {
    return Base.knex<DisplayChannel>("display_channels").where("queue_channel_id", queueChannelId);
  }

  public static getFirstFromQueue(queueChannelId: Snowflake) {
    return Base.knex<DisplayChannel>("display_channels")
      .where("queue_channel_id", queueChannelId)
      .first();
  }

  public static getFromMessage(messageId: Snowflake) {
    return Base.knex<DisplayChannel>("display_channels").where("message_id", messageId).first();
  }

  public static async store(
    queueChannel: VoiceChannel | StageChannel | TextChannel,
    displayChannel: TextChannel,
    embeds: MessageEmbed[]
  ): Promise<void> {
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

  public static async unstore(
    queueChannelId: Snowflake,
    displayChannelId?: Snowflake,
    deleteOldDisplays = true
  ): Promise<void> {
    let query = Base.knex<DisplayChannel>("display_channels").where(
      "queue_channel_id",
      queueChannelId
    );
    if (displayChannelId) query = query.where("display_channel_id", displayChannelId);
    const storedDisplayChannels = await query;
    await query.delete();
    if (!storedDisplayChannels) return;

    for await (const storedDisplayChannel of storedDisplayChannels) {
      const displayChannel = (await Base.client.channels
        .fetch(storedDisplayChannel.display_channel_id)
        .catch(() => null)) as TextChannel;
      if (!displayChannel) continue;

      const displayMessage = await displayChannel.messages
        .fetch(storedDisplayChannel.message_id, { cache: false })
        .catch(() => null as Message);
      if (!displayMessage) continue;

      if (deleteOldDisplays) {
        // Delete
        await displayMessage.delete().catch(() => null);
      } else {
        // Remove button
        await displayMessage
          .edit({ embeds: displayMessage.embeds, components: [] })
          .catch(() => null);
      }
    }
  }

  public static async validate(
    queueChannel: GuildChannel,
    channels: GuildChannel[]
  ): Promise<boolean> {
    let updateRequired = false;
    const storedEntries = await this.getFromQueue(queueChannel.id);
    for await (const entry of storedEntries) {
      if (!channels.some((c) => c.id === entry.display_channel_id)) {
        await this.unstore(queueChannel.id, entry.display_channel_id);
        updateRequired = true;
      }
    }
    return updateRequired;
  }
}
