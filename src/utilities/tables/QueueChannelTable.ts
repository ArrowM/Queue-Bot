/* eslint-disable @typescript-eslint/camelcase */
import { Client, Guild, TextChannel, VoiceChannel } from "discord.js";
import { QueueChannel } from "../../Interfaces";
import Knex from "knex";
import { DatabaseTable } from "./DatabaseTable";
import { DisplayChannelTable } from "./DisplayChannelTable";
import { QueueMemberTable } from "./QueueMemberTable";

export class QueueChannelTable extends DatabaseTable {

    private queueMemberTable: QueueMemberTable;
    private displayChannelTable: DisplayChannelTable;

    constructor(client: Client, knex: Knex) {
        super(client, knex);
        this.queueMemberTable = new QueueMemberTable(client, knex);
        this.displayChannelTable = new DisplayChannelTable(client, knex);
    }

    /**
     * Add max_members column
     */
    private async addMaxMembers(): Promise<void> {
        if (!(await this.knex.schema.hasColumn('queue_channels', 'max_members'))) {
            await this.knex.schema.table('queue_channels', table => table.text('max_members'));
        }
    }

    /**
     * Modify the database structure for code patches
     */
    protected async updateTableStructure(): Promise<void> {
        await this.addMaxMembers();
    }

    /**
     * Create & update QueueChannel database table if necessary
     */
    public async initTable(): Promise<void> {
        await this.knex.schema.hasTable('queue_channels').then(async exists => {
            if (!exists) await this.knex.schema.createTable('queue_channels', table => {
                table.text('queue_channel_id').primary();
                table.text('guild_id');
                table.text('max_members');
            }).catch(e => console.error(e));
        });
	
        await this.updateTableStructure();
    }

    /**
     *
     * @param channelToAdd
     */
    public async storeQueueChannel(channelToAdd: VoiceChannel | TextChannel, maxMembers?: number): Promise<void> {
        // Fetch old channels
        await this.knex<QueueChannel>('queue_channels')
            .insert({
                queue_channel_id: channelToAdd.id,
                guild_id: channelToAdd.guild.id,
                max_members: maxMembers?.toString()
            }).catch(() => null);
        if (channelToAdd.type === 'voice') {
            await this.queueMemberTable.storeQueueMembers(channelToAdd.id, channelToAdd.members
                .filter(member => !member.user.bot).map(member => member.id));
        }
    }

    /**
     *
     * @param guild
     * @param channelIdToRemove
     */
    public async unstoreQueueChannel(guildId: string, channelIdToRemove?: string): Promise<void> {
        if (channelIdToRemove) {
            await this.knex<QueueChannel>('queue_channels')
                .where('queue_channel_id', channelIdToRemove)
                .first()
                .del();
            await this.queueMemberTable.unstoreQueueMembers(channelIdToRemove);
            await this.displayChannelTable.unstoreDisplayChannel(channelIdToRemove);
        } else {
            const storedQueueChannels = await this.knex<QueueChannel>('queue_channels')
                .where('guild_id', guildId);
            for (const storedQueueChannel of storedQueueChannels) {
                await this.queueMemberTable.unstoreQueueMembers(storedQueueChannel.queue_channel_id);
                await this.displayChannelTable.unstoreDisplayChannel(storedQueueChannel.queue_channel_id);
            }
            await this.knex<QueueChannel>('queue_channels')
                .where('guild_id', guildId)
                .del();
        }
    }

    /**
     *
     * @param guild
     */
    public async fetchStoredQueueChannels(guild: Guild): Promise<(VoiceChannel | TextChannel)[]> {
        const queueChannelIdsToRemove: string[] = [];
        // Fetch stored channels
        const storedQueueChannels = await this.knex<QueueChannel>('queue_channels')
            .where('guild_id', guild.id);
        if (!storedQueueChannels) return null;

        const queueChannels: (VoiceChannel | TextChannel)[] = [];

        // Check for deleted channels
        // Going backwards allows the removal of entries while visiting each one
        for (let i = storedQueueChannels.length - 1; i >= 0; i--) {
            const queueChannelId = storedQueueChannels[i].queue_channel_id;
            const queueChannel = guild.channels.cache.get(queueChannelId) as VoiceChannel | TextChannel;
            if (queueChannel) {
                // Still exists, add to return list
                queueChannels.push(queueChannel);
            } else {
                // Channel has been deleted, update database
                queueChannelIdsToRemove.push(queueChannelId);
            }
        }
        for (const queueChannelId of queueChannelIdsToRemove) {
            await this.unstoreQueueChannel(guild.id, queueChannelId);
        }
        return queueChannels;
    }
}