import { QueueGuildTable } from "./tables/QueueGuildTable";
import { QueueChannelTable } from "./tables/QueueChannelTable";
import { DisplayChannelTable } from "./tables/DisplayChannelTable";
import { QueueMemberTable } from "./tables/QueueMemberTable";
import Knex from "knex";
import { Client, Guild, MessageEmbed, TextChannel, VoiceChannel } from "discord.js";

export class DatabaseUtils {
    private queueGuildTable: QueueGuildTable;
    private queueChannelTable: QueueChannelTable;
    private displayChannelTable: DisplayChannelTable;
    private queueMemberTable: QueueMemberTable;

    constructor(client: Client, knex: Knex) {
        this.queueGuildTable = new QueueGuildTable(client, knex);
        this.queueChannelTable = new QueueChannelTable(client, knex);
        this.displayChannelTable = new DisplayChannelTable(client, knex);
        this.queueMemberTable = new QueueMemberTable(client, knex);

        this.queueGuildTable.initTable();
        this.queueChannelTable.initTable();
        this.displayChannelTable.initTable();
        this.queueMemberTable.initTable();
    }

    // ---------- QUEUE CHANNEL
    public async storeQueueChannel(channelToAdd: VoiceChannel | TextChannel, maxMembers?: number): Promise<void> {
        return await this.queueChannelTable.storeQueueChannel(channelToAdd, maxMembers);
    }

    public async unstoreQueueChannel(guildId: string, channelIdToRemove?: string): Promise<void> {
        return await this.queueChannelTable.unstoreQueueChannel(guildId, channelIdToRemove);
    }

    public async fetchStoredQueueChannels(guild: Guild): Promise<(VoiceChannel | TextChannel)[]> {
        return await this.queueChannelTable.fetchStoredQueueChannels(guild);
    }

    // ---------- DISPLAY CHANNEL
    public async unstoreDisplayChannel(queueChannelId: string, displayChannelIdToRemove?: string, deleteOldDisplayMsg = true): Promise<void> {
        return await this.displayChannelTable.unstoreDisplayChannel(queueChannelId, displayChannelIdToRemove, deleteOldDisplayMsg);
    }

    public async storeDisplayChannel(queueChannel: VoiceChannel | TextChannel, displayChannel: TextChannel, msgEmbed: Partial<MessageEmbed>): Promise<void> {
        return await this.displayChannelTable.storeDisplayChannel(queueChannel, displayChannel, msgEmbed);  
    }

    // ---------- QUEUE MEMBERS
    public async storeQueueMembers(queueChannelId: string, memberIdsToAdd: string[], personalMessage?: string): Promise<void> {
        return await this.queueMemberTable.storeQueueMembers(queueChannelId, memberIdsToAdd, personalMessage);
    }

    public async unstoreQueueMembers(queueChannelId: string, memberIdsToRemove?: string[]): Promise<void> {
        return await this.queueMemberTable.unstoreQueueMembers(queueChannelId, memberIdsToRemove);
    }
}