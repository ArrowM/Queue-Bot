/* eslint-disable @typescript-eslint/camelcase */
import { MessageEmbed, TextChannel, VoiceChannel } from "discord.js";
import { DisplayChannel } from "../../Interfaces";
import { DatabaseTable } from "./DatabaseTable";

export class DisplayChannelTable extends DatabaseTable {
    /**
     * Migration of embed_ids column to emdbed_id
     */
    private async addEmbedId(): Promise<void> {
        if (await this.knex.schema.hasColumn('display_channels', 'embed_ids')) {
            console.log('Migrating display embed ids');
            await this.knex.schema.table('display_channels', table => table.text('embed_id'));
            (await this.knex<DisplayChannel>('display_channels')).forEach(async displayChannel => {
                await this.knex<DisplayChannel>('display_channels')
                    .where('display_channel_id', displayChannel.display_channel_id)
                    .where('queue_channel_id', displayChannel.queue_channel_id)
                    .update('embed_id', displayChannel['embed_ids'][0]);
            });
            await this.knex.schema.table('display_channels', table => table.dropColumn('embed_ids'));
        }
    }

    /**
     * Modify the database structure for code patches
     */
    protected async updateTableStructure(): Promise<void> {
        await this.addEmbedId();
    }

    /**
     * Create & update DisplayChannel database table if necessary
     */
    public async initTable(): Promise<void> {
        await this.knex.schema.hasTable('display_channels').then(async exists => {
            if (!exists) await this.knex.schema.createTable('display_channels', table => {
                table.increments('id').primary();
                table.text('queue_channel_id');
                table.text('display_channel_id');
                table.text('embed_id');
            }).catch(e => console.error(e));
        });
	
        await this.updateTableStructure();
    }

    /**
     *
     * @param queueChannel
     * @param displayChannel
     * @param msgEmbed
     */
    public async storeDisplayChannel(queueChannel: VoiceChannel | TextChannel, displayChannel: TextChannel,
            msgEmbed: Partial<MessageEmbed>): Promise<void> {

        let embedId: string;
        // For each embed, send and collect the id

        await displayChannel.send({ embed: msgEmbed })
            .then(msg => { if (msg) embedId = msg.id })
            .catch(() => null);

        // Store the ids in the database
        await this.knex<DisplayChannel>('display_channels')
            .insert({
                queue_channel_id: queueChannel.id,
                display_channel_id: displayChannel.id,
                embed_id: embedId
            });
    }

    /**
     *
     * @param queueChannelId
     * @param displayChannelIdToRemove
     * @param deleteOldDisplayMsg
     */
    public async unstoreDisplayChannel(queueChannelId: string, displayChannelIdToRemove?: string,
            deleteOldDisplayMsg = true): Promise<void> {

        let storedDisplayChannels: DisplayChannel[];

        // Retreive list of stored embeds for display channel
        if (displayChannelIdToRemove) {
            storedDisplayChannels = await this.knex('display_channels')
                .where('queue_channel_id', queueChannelId)
                .where('display_channel_id', displayChannelIdToRemove);
            await this.knex('display_channels')
                .where('queue_channel_id', queueChannelId)
                .where('display_channel_id', displayChannelIdToRemove)
                .del();
        } else {
            storedDisplayChannels = await this.knex('display_channels')
                .where('queue_channel_id', queueChannelId);
            await this.knex('display_channels')
                .where('queue_channel_id', queueChannelId)
                .del();
        }

        if (!storedDisplayChannels || !deleteOldDisplayMsg) return;

        // If found, delete them from discord
        for (const storedDisplayChannel of storedDisplayChannels) {
            const displayChannel = await this.client.channels
                .fetch(storedDisplayChannel.display_channel_id)
                .catch(() => null) as TextChannel;

            if (displayChannel) {
                await displayChannel.messages
                    .fetch(storedDisplayChannel.embed_id, false)
                    .then(embed => embed?.delete())
                    .catch(() => null);
            }
        }
    }
}