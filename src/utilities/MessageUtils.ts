import { Message, MessageEmbed, TextChannel, VoiceChannel } from "discord.js";
import config from '../config.json';
import { BaseClass } from "../BaseClass";
import { QueueChannel, QueueGuild, QueueMember } from "../Interfaces";

export class MessageUtils extends BaseClass {

    /**knex<QueueChannel>
     * Send message
     * @param message
     * @param messageToSend
     */
    public static async sendResponse(message: Message, messageToSend: {} | string): Promise<Message> {
        const channel = message.channel as TextChannel;
        if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
            return message.channel.send(messageToSend)
                .catch(() => null);
        } else {
            return message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``)
                .catch(() => null);
        }
    }

    /**
     * Return a grace period in string form
     * @param gracePeriod Guild id.
     */
    private gracePeriodCache = new Map();
    public async getGracePeriodString(gracePeriod: string): Promise<string> {
        if (!this.gracePeriodCache.has(gracePeriod)) {
            let result;
            if (gracePeriod === '0') {
                result = '';
            } else {
                const graceMinutes = Math.round(+gracePeriod / 60);
                const graceSeconds = +gracePeriod % 60;
                const timeString = (graceMinutes > 0 ? graceMinutes + ' minute' : '') + (graceMinutes > 1 ? 's' : '')
                    + (graceMinutes > 0 && graceSeconds > 0 ? ' and ' : '')
                    + (graceSeconds > 0 ? graceSeconds + ' second' : '') + (graceSeconds > 1 ? 's' : '');
                result = ` If you leave, you have ${timeString} to rejoin to reclaim your spot.`
            }
            this.gracePeriodCache.set(gracePeriod, result);
        }
        return this.gracePeriodCache.get(gracePeriod);
    }

    /**
     * Create an Embed to represent everyone in a single queue. Will create multiple embeds for large queues
     * @param queueGuild
     * @param queueChannel Discord message object.
     */
    public async generateEmbed(queueGuild: QueueGuild, queueChannel: TextChannel | VoiceChannel): Promise<Partial<MessageEmbed>> {
        const storedQueueChannel = await this.knex<QueueChannel>('queue_channels')
            .where('queue_channel_id', queueChannel.id)
            .first();
        const queueMembers = (await this.knex<QueueMember>('queue_members')
            .where('queue_channel_id', queueChannel.id).orderBy('created_at'))
            .slice(0, +storedQueueChannel.max_members || 625);

        const embed = new MessageEmbed();
        embed.setTitle(queueChannel.name + (storedQueueChannel.max_members ? `  -  ${queueMembers.length}/${storedQueueChannel.max_members}` : ''));
        embed.setColor(queueGuild.color);
        embed.setDescription(queueChannel.type === 'voice' ?
            // Voice
            `Join the **${queueChannel.name}** voice channel to join this queue.` + await this.getGracePeriodString(queueGuild.grace_period) :
            // Text
            `Type \`${queueGuild.prefix}${config.joinCmd} ${queueChannel.name}\` to join or leave this queue.`,
        );
        //embed.setTimestamp();

        if (!queueMembers || queueMembers.length === 0) {
            // Handle empty queue
            embed.addField(
                'No members in queue.',
                '\u200b'
            );
        } else {
            // Handle non-empty
            const maxEmbedSize = 25;
            let position = 0;
            for (let i = 0; i < queueMembers.length / maxEmbedSize; i++) {
                embed.addField(
                    '\u200b',
                    queueMembers
                        .slice(position, position + maxEmbedSize)
                        .reduce((accumlator: string, queueMember: QueueMember) =>
                            accumlator = accumlator +
                            `${++position} <@!${queueMember.queue_member_id}>`
                            + (queueMember.personal_message ? ' -- ' + queueMember.personal_message : '') + '\n',
                            '')
                );
            }
            embed.fields[0].name = `Queue length: **${queueMembers ? queueMembers.length : 0}**`
        }

        return embed;
    }
}