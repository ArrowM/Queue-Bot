/* eslint-disable @typescript-eslint/camelcase */
import { EventEmitter } from 'events';
import DBL from 'dblapi.js';
import { Client, Guild, GuildMember, Message, TextChannel, VoiceChannel } from 'discord.js';
import Knex from 'knex';
import config from './config.json';
import { DatabaseUtils } from './utilities/DatabaseUtils';
import { ParsedArguments, QueueChannel, QueueGuild, QueueMember } from './Interfaces';
import { Commands } from './Commands';

// Setup client
EventEmitter.defaultMaxListeners = 0;   // Maximum number of events that can be handled at once.
const client = new Client({
    ws: { intents: ['GUILDS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES'] },
    presence: {
        activity: {
            name: `${config.prefix}${config.helpCmd} for help`
        },
        status: 'online'
    },
    messageEditHistoryMaxSize: 0,	    // Do not cache edits
    messageCacheMaxSize: 2,		        // Cache up to 2 messages per channel
    messageCacheLifetime: 12 * 60 * 60,	// Cache messages for 12 hours
    messageSweepInterval: 1 * 60 * 60,  // Sweep every hour
});
client.login(config.token);
client.on('error', console.error);
client.on('shardError', console.error);

// Top GG integration
if (config.topGgToken) {
    const dbl = new DBL(config.topGgToken, client);
    dbl.on('error', () => null);
}

// Keyv long term DB storage
const knex = Knex({
    client: config.databaseType,
    connection: {
        host: config.databaseHost,
        user: config.databaseUsername,
        password: config.databasePassword,
        database: config.databaseName
    }
});

const databaseUtils = new DatabaseUtils(client, knex);
const commands = new Commands(client, knex, databaseUtils);

/**
 * Determine whether user has permission to interact with bot
 * @param message Discord message object.
 */
function checkPermission(message: Message): boolean {
    const regex = RegExp(config.permissionsRegexp, 'i');
    return message.member.roles.cache.some(role => regex.test(role.name)) || message.member.id === message.guild.ownerID;
}

function setNickname(guild: Guild, prefix: string): void {
    guild.me.setNickname(`(${prefix}) Queue Bot`).catch(() => null);
}

/**
 *
 * @param guild
 */
async function createDefaultGuild(guild: Guild): Promise<QueueGuild> {
    await knex<QueueGuild>('queue_guilds').insert({
        guild_id: guild.id,
        grace_period: '0',
        prefix: config.prefix,
        color: '#51ff7e',
        msg_mode: 1
    }).catch(() => null);
    setNickname(guild, config.prefix);
    return await knex<QueueGuild>('queue_guilds').where('guild_id', guild.id).first();
}

client.on('message', async message => {
    if (message.author.bot) return;
    const guild = message.guild;
    // NOTE: DO NOT USE queue_channel_ids from the variable. Lock first, then call knex<GuildQueue>('queue_guilds').
    const queueGuild = await knex<QueueGuild>('queue_guilds').where('guild_id', guild.id).first()
        || await createDefaultGuild(guild);

    const parsed: ParsedArguments = { command: null, arguments: null };
    if (message.content.startsWith(queueGuild.prefix)) {
        // Parse the message
        // Note: prefix can contain spaces. Command can not contains spaces. parsedArgs can contain spaces.
        parsed.command = message.content.substring(queueGuild.prefix.length).split(' ')[0];
        parsed.arguments = message.content.substring(queueGuild.prefix.length + parsed.command.length + 1).trim();
        const hasPermission = checkPermission(message);
        // Restricted commands
        if (hasPermission) {
            switch (parsed.command) {
                // Start
                case config.startCmd:
                    commands.start(queueGuild, parsed, message);
                    break;
                // Display
                case config.displayCmd:
                    commands.displayQueue(queueGuild, parsed, message);
                    break;
                // Set Queue
                case config.queueCmd:
                    commands.setQueueChannel(queueGuild, parsed, message);
                    break;
                // Pop next user
                case config.nextCmd:
                    commands.popTextQueue(queueGuild, parsed, message);
                    break;
                // Pop next user
                case config.kickCmd:
                    commands.kickMember(queueGuild, parsed, message);
                    break;
                // Clear queue
                case config.clearCmd:
                    commands.clearQueue(queueGuild, parsed, message);
                    break;
                // Shuffle queue
                case config.shuffleCmd:
                    commands.shuffleQueue(queueGuild, parsed, message);
                    break;

                // Grace period
                case config.gracePeriodCmd:
                    commands.setServerSetting(queueGuild, parsed, message,
                        +parsed.arguments >= 0 && +parsed.arguments <= 6000,
                        'Grace period must be between `0` and `6000` seconds.'
                    );
                    break;
                // Prefix
                case config.prefixCmd:
                    commands.setServerSetting(queueGuild, parsed, message,
                        true,
                    );
                    setNickname(guild, parsed.arguments);
                    break;
                // Color
                case config.colorCmd:
                    commands.setServerSetting(queueGuild, parsed, message,
                        /^#?[0-9A-F]{6}$/i.test(parsed.arguments),
                        'Use HEX color:',
                        {
                            'title': 'Hex color picker',
                            'url': 'https://htmlcolorcodes.com/color-picker/',
                            'color': queueGuild.color
                        }
                    );
                    break;
                // Toggle New message on update
                case config.modeCmd:
                    commands.setServerSetting(queueGuild, parsed, message,
                        +parsed.arguments >= 1 && +parsed.arguments <= 3,
                        'When the queue changes: \n' +
                        '`1`: (default) Update old display message \n' +
                        '`2`: Send a new display message and delete the old one. \n' +
                        '`3`: Send a new display message.'
                    );
                    break;
            }
        } else if ([config.startCmd, config.displayCmd, config.queueCmd, config.nextCmd, config.kickCmd, config.clearCmd,
        config.gracePeriodCmd, config.prefixCmd, config.colorCmd].includes(parsed.command)) {
            message.author.send(`You don't have permission to use bot commands in \`${message.guild.name}\`.`
                + `You must be assigned a \`queue mod\`, \`mod\`, or \`admin\` role on the server to use bot commands.`)
                .catch(() => null);
        }
        // Commands open to everyone
        switch (parsed.command) {
            // Help
            case config.helpCmd:
                commands.help(queueGuild, parsed, message);
                break;
            // Join Text Queue
            case config.joinCmd:
                commands.joinTextChannel(queueGuild, parsed, message, hasPermission);
                break;
        }
    } else if (message.content === config.prefix + config.helpCmd) {
        // Default help command
        commands.help(queueGuild, parsed, message);
    }
});

async function resumeQueueAfterOffline(): Promise<void> {
    const storedQueueGuilds = await knex<QueueGuild>('queue_guilds');
    for (const storedQueueGuild of storedQueueGuilds) {
        try {
            const guild = await client.guilds.fetch(storedQueueGuild.guild_id);

            const storedQueueChannels = await knex<QueueChannel>('queue_channels')
                .where('guild_id', guild.id);
            for (const storedQueueChannel of storedQueueChannels) {
                const queueChannel = guild.channels.cache.get(storedQueueChannel.queue_channel_id) as TextChannel | VoiceChannel;
                if (queueChannel) {
                    if (queueChannel.type !== 'voice') continue;
                    let updateDisplay = false;

                    // Fetch stored and live members
                    const storedQueueMemberIds = await knex<QueueMember>('queue_members')
                        .where('queue_channel_id', queueChannel.id)
                        .pluck('queue_member_id');
                    const queueMemberIds = queueChannel.members.filter(member => !member.user.bot).keyArray();

                    // Update member lists
                    for (const storedQueueMemberId of storedQueueMemberIds) {
                        if (!queueMemberIds.includes(storedQueueMemberId)) {
                            updateDisplay = true;
                            await knex<QueueMember>('queue_members')
                                .where('queue_channel_id', queueChannel.id)
                                .where('queue_member_id', storedQueueMemberId)
                                .del();
                        }
                    }

                    for (const queueMemberId of queueMemberIds) {
                        if (!storedQueueMemberIds.includes(queueMemberId)) {
                            updateDisplay = true;
                            await knex<QueueMember>('queue_members')
                                .where('queue_channel_id', queueChannel.id)
                                .insert({
                                    queue_channel_id: queueChannel.id,
                                    queue_member_id: queueMemberId
                                });
                        }
                    }

                    if (updateDisplay) {
                        // Update displays
                        await commands.updateDisplayQueue(storedQueueGuild, [queueChannel], true);
                    }
                } else {
                    // Cleanup deleted queue channels
                    await databaseUtils.unstoreQueueChannel(guild.id, storedQueueChannel.queue_channel_id);
                }
            }
        } catch (e) {
            if (e?.code === 50001) {
                // Cleanup deleted guilds
                await databaseUtils.unstoreQueueChannel(storedQueueGuild.guild_id);
                await knex<QueueGuild>('queue_guilds')
                    .where('guild_id', storedQueueGuild.guild_id)
                    .del();
            } else {
                console.error(e);
            }
        }
    }
}

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once('ready', async () => {
    await resumeQueueAfterOffline();
    console.log('Ready!');
});

client.on('shardResume', async () => {
    await resumeQueueAfterOffline();
    console.log('Reconnected!');
});

/**
 * Store members who leave queues, time stamp them
 * @param queueGuild
 * @param guild Guild containing queue
 * @param oldVoiceChannel Queue channel being left
 */
const blockNextCache = new Set<string>();
const returningMembersCache = new Map<string, { member: QueueMember; time: number }>();
async function markLeavingMember(member: GuildMember, oldVoiceChannel: VoiceChannel): Promise<void> {
    // Fetch Member
    const storedQueueMember = await knex<QueueMember>('queue_members')
        .where('queue_channel_id', oldVoiceChannel.id)
        .where('queue_member_id', member.id)
        .first();
    await databaseUtils.unstoreQueueMembers(oldVoiceChannel.id, [member.id]);
    returningMembersCache.set(oldVoiceChannel.id + '.' + member.id, {
        member: storedQueueMember,
        time: Date.now()
    });
}

// Monitor for users joining voice channels
client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
    const oldVoiceChannel = oldVoiceState?.channel;
    const newVoiceChannel = newVoiceState?.channel;

    if (oldVoiceChannel !== newVoiceChannel) {
        const member = newVoiceState.member;
        const guild = newVoiceState.guild;

        const queueGuild = await knex<QueueGuild>('queue_guilds').where('guild_id', guild.id).first();
        const storedOldQueueChannel = oldVoiceChannel ?
            await knex<QueueChannel>('queue_channels').where('queue_channel_id', oldVoiceChannel.id).first()
            : undefined;
        const storedNewQueueChannel = newVoiceChannel ?
            await knex<QueueChannel>('queue_channels').where('queue_channel_id', newVoiceChannel.id).first()
            : undefined;

        const channelsToUpdate: VoiceChannel[] = [];

        if (storedOldQueueChannel && storedNewQueueChannel && member.user.bot) {
            return;
        }
        if (storedNewQueueChannel && !member.user.bot) {
            // Joined queue channel
            // Check for existing, don't duplicate member entries
            const recentMember = returningMembersCache.get(newVoiceChannel.id + '.' + member.id);
            returningMembersCache.delete(newVoiceChannel.id + '.' + member.id);

            const withinGracePeriod = recentMember ?
                (Date.now() - recentMember.time) < (+queueGuild.grace_period * 1000)
                : false;

            if (withinGracePeriod) {
                await knex<QueueMember>('queue_members').insert(recentMember.member);
            } else {
                await databaseUtils.storeQueueMembers(newVoiceChannel.id, [member.id]);
            }
            channelsToUpdate.push(newVoiceChannel);
        }
        if (storedOldQueueChannel) {
            // Left queue channel
            if (member.user.bot && newVoiceChannel) {
                // Pop the nextQueueMember off the stored queue
                const nextStoredQueueMember = await knex<QueueMember>('queue_members')
                    .where('queue_channel_id', oldVoiceChannel.id).orderBy('created_at').first();
                if (!nextStoredQueueMember) return;

                const nextQueueMember: GuildMember = await guild.members.fetch(nextStoredQueueMember.queue_member_id).catch(() => null);
                // Block recentMember caching when the bot is used to pull someone
                if (nextQueueMember) {
                    blockNextCache.add(nextQueueMember.id);
                    // Swap bot with nextQueueMember
                    nextQueueMember.voice.setChannel(newVoiceChannel).catch(() => null);
                    member.voice.setChannel(oldVoiceChannel).catch(() => null);
                }
            } else {
                if (blockNextCache.delete(member.id)) {
                    // Getting pulled using bot, do not cache
                    await databaseUtils.unstoreQueueMembers(oldVoiceChannel.id, [member.id]);
                } else {
                    // Otherwise, cache it
                    await markLeavingMember(member, oldVoiceChannel);
                }
            }
            channelsToUpdate.push(oldVoiceChannel);
        }
        if (channelsToUpdate.length > 0) {
            commands.updateDisplayQueue(queueGuild, channelsToUpdate);
        }
    }
});