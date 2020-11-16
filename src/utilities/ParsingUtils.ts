import { Client, Message, TextChannel, VoiceChannel } from "discord.js";
import config from '../config.json';
import Knex from "knex";
import { BaseClass } from "../BaseClass";
import { MessageUtils } from "./MessageUtils";
import { DatabaseUtils } from "./DatabaseUtils";
import { ParsedArguments, QueueGuild } from "../Interfaces";

export class ParsingUtils extends BaseClass {
    private databaseUtils: DatabaseUtils;

    constructor(client: Client, knex: Knex, databaseUtils: DatabaseUtils) {
        super(client, knex);
        this.databaseUtils = databaseUtils;
    }

    /**
     * Fetch tailing number from a string.
     * Ex:  '!n #general 2' returns 2.
     * @param message
     * @param argument
     */
    public getTailingNumberFromString(message: Message, argument: string): number {
        // Get number of users to pop
        let num = +argument.split(' ').slice(-1).pop();
        if (isNaN(num)) {
            num = null;
        } else if (num < 1) {
            MessageUtils.sendResponse(message, `\`amount\` must be a postive number!`);
            num = null;
        }
        return num;
    }

    /**
     * Extracts a channel from command arguments. Starting with the largest matching substring
     * @param availableChannels
     * @param parsed
     * @param message
     */
    public extractChannel(availableChannels: (VoiceChannel | TextChannel)[], parsed: ParsedArguments,
            message: Message): VoiceChannel | TextChannel {

        let channel = availableChannels.find(channel => channel.id === message.mentions.channels.array()[0]?.id);
        if (!channel && parsed.arguments) {
            const splitArgs = parsed.arguments.split(' ');
            for (let i = splitArgs.length; i > 0; i--) {
                if (channel) break;
                const channelNameToCheck = splitArgs.slice(0, i).join(' ');
                channel = availableChannels.find(channel => channel.name === channelNameToCheck) ||
                    availableChannels.find(channel => channel.name.localeCompare(channelNameToCheck, undefined, { sensitivity: 'accent' }) === 0);
            }
        }
        return channel;
    }

    /**
     * Send a message detailing that a channel was not found.
     * @param queueGuild
     * @param parsed
     * @param channels
     * @param message
     * @param includeMention
     * @param type
     */
    public reportChannelNotFound(queueGuild: QueueGuild, parsed: ParsedArguments, channels: (VoiceChannel | TextChannel)[],
        message: Message, includeMention: boolean, type: string): void {

        let response;
        if (channels.length === 0) {
            response = 'No ' + (type ? `**${type}** ` : '') + 'queue channels set.'
                + '\nSet a ' + (type ? `${type} ` : '') + `queue first using \`${queueGuild.prefix}${config.queueCmd} {channel name}\`.`;
        } else {
            response = 'Invalid ' + (type ? `**${type}** ` : '') + `channel name. Try \`${queueGuild.prefix}${parsed.command} `;
            if (channels.length === 1) {
                // Single channel, recommend the single channel
                response += channels[0].name + (includeMention ? ' @{user}' : '') + '`.'
            } else {
                // Multiple channels, list them
                response += '{channel name}' + (includeMention ? ' @{user}' : '') + '`.'
                    + '\nAvailable ' + (type ? `**${type}** ` : '')
                    + `channel names: ${channels.map(channel => ' `' + channel.name + '`')}.`
            }
        }
        MessageUtils.sendResponse(message, response);
    }

    /**
     * Get a channel using user argument
     * @param queueGuild
     * @param parsed
     * @param message
     * @param includeMention? Include mention in error message
     * @param type? Type of channels to fetch ('voice' or 'text')
     */
    public async fetchChannel(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message,
        includeMention?: boolean, type?: string): Promise<VoiceChannel | TextChannel> {
        const guild = message.guild;
        const storedChannels = await this.databaseUtils.fetchStoredQueueChannels(guild);

        if (storedChannels.length > 0) {
            // Extract channel name from message
            const availableChannels = type ?
                storedChannels.filter(channel => channel.type === type) :
                storedChannels;

            if (availableChannels.length === 1) {
                return availableChannels[0];
            } else {
                const channel = this.extractChannel(availableChannels, parsed, message);
                if (channel) {
                    return channel;
                } else {
                    this.reportChannelNotFound(queueGuild, parsed, availableChannels, message, includeMention, type);
                }
            }
        } else {
            MessageUtils.sendResponse(message, `No queue channels set.`
                + `\nSet a queue first using \`${queueGuild.prefix}${config.queueCmd} {channel name}\`.`
            );
        }
        return null;
    }
}