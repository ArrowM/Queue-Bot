/* eslint-disable @typescript-eslint/camelcase */
import { Client, Guild, Message, TextChannel, VoiceChannel, GuildMember, MessageEmbed } from 'discord.js';
import { Mutex, MutexInterface } from 'async-mutex';
import Knex from 'knex';
import config from './config.json';
import DBL from 'dblapi.js';

// Setup client
 require('events').EventEmitter.defaultMaxListeners = 0; // Maximum number of events that can be handled at once.
const client = new Client({
	ws: { intents: ['GUILDS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES'] },
	presence: {
		activity: {
			name: `${config.prefix}${config.helpCmd} for help`
		},
		status: 'online'
	},
	messageEditHistoryMaxSize: 0,	// Don't cache edits
	messageCacheMaxSize: 100,		// Cache up to 100 messages per channel
	messageCacheLifetime: 3600,		// Cache messages for 1 hour
	messageSweepInterval: 1800,		// Sweep every 30 minutes.
});
client.login(config.token);

// Top GG integration
if (config.topGgToken) {
	const dbl = new DBL(config.topGgToken, client);
	dbl.on('error', () => null);
}

// Map commands to database columns and display strings
const ServerSettings = {
	[config.gracePeriodCmd]: { dbVariable: 'grace_period', str: 'grace period' },
	[config.prefixCmd]: { dbVariable: 'prefix', str: 'prefix' },
	[config.colorCmd]: { dbVariable: 'color', str: 'color' },
	[config.modeCmd]: {dbVariable: 'msg_mode', str: 'message mode' }
};
Object.freeze(ServerSettings);

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

interface QueueGuild {
	guild_id: string;
	grace_period: string;
	prefix: string;
	color: string;
	msg_mode: number;
}

interface QueueChannel {
	queue_channel_id: string;
	guild_id: string;
}

interface QueueMember {
	id: number;
	queue_channel_id: string;
	queue_member_id: string;
	personal_message: string;
	created_at: string;
}

interface DisplayChannel {
	queue_channel_id: string;
	display_channel_id: string;
	embed_id: string;
}

// Storage Mutexes
const queueChannelsLocks = new Map<string, MutexInterface>();		// Map<QueueGuild id, MutexInterface>;
const membersLocks = new Map<string, MutexInterface>();				// Map<QueueChannel id, MutexInterface>;
const displayChannelsLocks = new Map<string, MutexInterface>();		// Map<QueueChannel id, MutexInterface>;

function getLock(map: Map<string, MutexInterface>, key: string): MutexInterface {
	let lock = map.get(key);
	if (!lock) {
		lock = new Mutex();
		map.set(key, lock);
	}
	return lock;
}

/**
 * Send message
 * @param message
 * @param messageToSend
 */
async function sendResponse(message: Message, messageToSend: {} | string): Promise<Message> {

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
 * 
 * @param queueChannel
 * @param displayChannel
 * @param msgEmbed
 */
async function addStoredDisplays(queueChannel: VoiceChannel | TextChannel, displayChannel: TextChannel,
	msgEmbed: Partial<MessageEmbed>): Promise<void> {

	await getLock(displayChannelsLocks, queueChannel.id).runExclusive(async () => {
		let embedId: string;
		// For each embed, send and collect the id

		await displayChannel.send({ embed: msgEmbed })
			.then(msg => { if (msg) embedId = msg.id })
			.catch(() => null);

		// Store the ids in the database
		await knex<DisplayChannel>('display_channels').insert({
			queue_channel_id: queueChannel.id,
			display_channel_id: displayChannel.id,
			embed_id: embedId
		});
	});
}

/**
 * 
 * @param queueChannelId
 * @param displayChannelIdToRemove
 * @param deleteOldDisplayMsg
 */
async function removeStoredDisplays(queueChannelId: string, displayChannelIdToRemove?: string, deleteOldDisplayMsg = true): Promise<void> {

	await getLock(displayChannelsLocks, queueChannelId).runExclusive(async () => {
		// Retreive list of stored embeds for display channel
		let storedDisplayChannelsQuery = knex('display_channels').where('queue_channel_id', queueChannelId);
		if (displayChannelIdToRemove) {
			storedDisplayChannelsQuery = storedDisplayChannelsQuery.where('display_channel_id', displayChannelIdToRemove);
		}

		const storedDisplayChannels = await storedDisplayChannelsQuery;
		// Delete stored embeds
		await storedDisplayChannelsQuery.del();

		if (!storedDisplayChannels || !deleteOldDisplayMsg) return;

		// If found, delete them from discord
		for (const storedDisplayChannel of storedDisplayChannels) {
			const displayChannel = await client.channels.fetch(storedDisplayChannel.display_channel_id).catch(() => null) as TextChannel;
			if (!displayChannel) continue;
			// Attempt to delete each of display embeds from discord
			await displayChannel.messages.fetch(storedDisplayChannel.embed_id)
				.then(embed => embed?.delete())
				.catch(() => null);
		}
	});
}

/**
 * 
 * @param queueChannelId
 * @param memberIdsToAdd
 * @param personalMessage
 */
async function addStoredQueueMembers(queueChannelId: string, memberIdsToAdd: string[], personalMessage?: string): Promise<void> {

	await getLock(membersLocks, queueChannelId).runExclusive(async () => {
		for (const memberId of memberIdsToAdd) {
			await knex<QueueMember>('queue_members').insert({
				queue_channel_id: queueChannelId,
				queue_member_id: memberId,
				personal_message: personalMessage
			});
		}
	});
}

/**
 * 
 * @param queueChannelId
 * @param memberIdsToRemove
 */
async function removeStoredQueueMembers(queueChannelId: string, memberIdsToRemove?: string[]): Promise<void> {

	await getLock(membersLocks, queueChannelId).runExclusive(async () => {
		// Retreive list of stored embeds for display channel
		let storedMemberQuery;
		if (memberIdsToRemove) {
			storedMemberQuery = knex<QueueMember>('queue_members')
				.where('queue_channel_id', queueChannelId)
				.whereIn('queue_member_id', memberIdsToRemove)
				.first();
		} else {
			storedMemberQuery = knex<QueueMember>('queue_members')
				.where('queue_channel_id', queueChannelId)
				.first();
		}
		await storedMemberQuery.del();
	});
}

/**
 * 
 * @param channelToAdd
 */
async function addStoredQueueChannel(channelToAdd: VoiceChannel | TextChannel): Promise<void> {

	await getLock(queueChannelsLocks, channelToAdd.guild.id).runExclusive(async () => {
		// Fetch old channels
		await knex<QueueChannel>('queue_channels').insert({
			queue_channel_id: channelToAdd.id,
			guild_id: channelToAdd.guild.id
		}).catch(() => null);
	});
	if (channelToAdd.type === 'voice') {
		await addStoredQueueMembers(channelToAdd.id, channelToAdd.members
			.filter(member => !member.user.bot).map(member => member.id));
    }
}

/**
 * 
 * @param guild
 * @param channelIdToRemove
 */
async function removeStoredQueueChannel(guildId: string, channelIdToRemove?: string): Promise<void> {

	await getLock(queueChannelsLocks, guildId).runExclusive(async () => {
		if (channelIdToRemove) {
			await knex<QueueChannel>('queue_channels').where('queue_channel_id', channelIdToRemove).first().del();
			await removeStoredQueueMembers(channelIdToRemove);
			await removeStoredDisplays(channelIdToRemove);
		} else {
			const storedQueueChannelsQuery = knex<QueueChannel>('queue_channels').where('guild_id', guildId);
			const storedQueueChannels = await storedQueueChannelsQuery;
			for (const storedQueueChannel of storedQueueChannels) {
				await removeStoredQueueMembers(storedQueueChannel.queue_channel_id);
				await removeStoredDisplays(storedQueueChannel.queue_channel_id);
			}
			await storedQueueChannelsQuery.del();
		}
	});
}

/**
 * 
 * @param guild
 */
async function fetchStoredQueueChannels(guild: Guild): Promise<(VoiceChannel | TextChannel)[]> {

	const queueChannelIdsToRemove: string[] = [];
	const queueChannels = await getLock(queueChannelsLocks, guild.id).runExclusive(async () => {
		// Fetch stored channels
		const storedQueueChannelsQuery = knex<QueueChannel>('queue_channels').where('guild_id', guild.id);
		const storedQueueChannels = await storedQueueChannelsQuery;
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
		return queueChannels;
	});
	for (const queueChannelId of queueChannelIdsToRemove) {
		await removeStoredQueueChannel(guild.id, queueChannelId);
    }
	return queueChannels;
}

/**
 * Return a grace period in string form
 * @param gracePeriod Guild id.
 */
const gracePeriodCache = new Map();
async function getGracePeriodString(gracePeriod: string): Promise<string> {

	if (!gracePeriodCache.has(gracePeriod)) {
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
		gracePeriodCache.set(gracePeriod, result);
	}
	return gracePeriodCache.get(gracePeriod);
}

/**
 * Create an Embed to represent everyone in a single queue. Will create multiple embeds for large queues
 * @param queueGuild
 * @param queueChannel Discord message object.
 */
async function generateEmbed(queueGuild: QueueGuild, queueChannel: TextChannel | VoiceChannel): Promise<Partial<MessageEmbed>> {

	const queueMembers = await knex<QueueMember>('queue_members')
		.where('queue_channel_id', queueChannel.id).orderBy('created_at');

	const embed = new MessageEmbed();
	embed.setTitle(queueChannel.name);
	embed.setColor(queueGuild.color);
	embed.setDescription(queueChannel.type === 'voice' ?
		// Voice
		`Join the **${queueChannel.name}** voice channel to join this queue.` + await getGracePeriodString(queueGuild.grace_period) :
		// Text
		`Type \`${queueGuild.prefix}${config.joinCmd} ${queueChannel.name}\` to join or leave this queue.`,
	);
	embed.setTimestamp();
	
	if (!queueMembers || queueMembers.length === 0) {
		// Handle empty queue
		embed.addField(
			'\u200b',
			'No members in queue.'
		);
	} else {
		// Handle non-empty
		const maxEmbedSize = 25;
		let position = 0;
		for (let i = 0; i < queueMembers.length / maxEmbedSize; i++) {
			embed.addField(
				'\u200b',
				queueMembers.slice(position, position + maxEmbedSize).reduce((accumlator, queueMember) =>
					accumlator = accumlator + `${++position} <@!${queueMember.queue_member_id}>`
					+ (queueMember.personal_message ? ' -- ' + queueMember.personal_message : '') + '\n', '')
			);
		}
		embed.fields[0].name = `Queue length: **${queueMembers ? queueMembers.length : 0}**`
	}

	return embed;
}

/**
 * Update a server's display messages
 * @param queueGuild
 * @param queueChannels Channels to update
 */
async function updateDisplayQueue(queueGuild: QueueGuild, queueChannels: (VoiceChannel | TextChannel)[]): Promise<void> {

	// For each updated queue
	for (const queueChannel of queueChannels) {
		if (!queueChannel) continue;
		const storedDisplayChannelsQuery = knex<DisplayChannel>('display_channels').where('queue_channel_id', queueChannel.id);
		const storedDisplayChannels = await storedDisplayChannelsQuery;
		if (!storedDisplayChannels || storedDisplayChannels.length === 0) return;

		// Create an embed list
		const msgEmbed = await generateEmbed(queueGuild, queueChannel);
		for (const storedDisplayChannel of storedDisplayChannels) {
			// For each embed list of the queue
			try {
				const displayChannel = await client.channels.fetch(storedDisplayChannel.display_channel_id) as TextChannel;

				if (displayChannel) {
					if (displayChannel.permissionsFor(displayChannel.guild.me).has('SEND_MESSAGES') &&
						displayChannel.permissionsFor(displayChannel.guild.me).has('EMBED_LINKS')) {

						if (queueGuild.msg_mode === 1) {
							/* Edit */
							// Retrieved display embeds
							const storedEmbed: Message = await displayChannel.messages.fetch(storedDisplayChannel.embed_id).catch(() => null);
							if (storedEmbed) {
								await storedEmbed.edit({ embed: msgEmbed }).catch(() => null);
							} else {
								await addStoredDisplays(queueChannel, displayChannel, msgEmbed);
							}
						} else {
							/* Replace */
							// Remove old display
							await removeStoredDisplays(queueChannel.id, displayChannel.id, queueGuild.msg_mode === 2);
							// Create new display
							await addStoredDisplays(queueChannel, displayChannel, msgEmbed);
						}
					}
				} else {
					// Handled deleted display channels
					await removeStoredDisplays(queueChannel.id, storedDisplayChannel.display_channel_id);
				}
			} catch (e) {
				// Skip
            }
		}
	}
}

/**
 * Extracts a channel from command arguments. Starting with the largest matching substring
 * @param availableChannels
 * @param parsed
 * @param message
 */
function extractChannel(availableChannels: (VoiceChannel | TextChannel)[], parsed: ParsedArguments,
	message: Message): VoiceChannel | TextChannel  {

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
 * Get a channel from available channels
 * @param queueGuild
 * @param availableChannels
 * @param parsed
 * @param message
 * @param includeMention Include mention in error message
 * @param type Type of channels to fetch ('voice' or 'text')
 * @param errorOnNoneFound? Show error if no channel is found
 */
async function findChannel(queueGuild: QueueGuild, availableChannels: (VoiceChannel | TextChannel)[], parsed: ParsedArguments,
	message: Message, includeMention: boolean, type: string, errorOnNoneFound?: boolean): Promise<VoiceChannel | TextChannel> {

	const channel = extractChannel(availableChannels, parsed, message);
	if (channel) return channel;

	if (!errorOnNoneFound) return;

	let response;
	if (availableChannels.length === 0) {
		response = 'No ' + (type ? `**${type}** ` : '') + 'queue channels set.'
			+ '\nSet a ' + (type ? `${type} ` : '') + `queue first using \`${queueGuild.prefix}${config.queueCmd} {channel name}\`.`;
	} else {
		response = 'Invalid ' + (type ? `**${type}** ` : '') + `channel name. Try \`${queueGuild.prefix}${parsed.command} `;
		if (availableChannels.length === 1) {
			// Single channel, recommend the single channel
			response += availableChannels[0].name + (includeMention ? ' @{user}' : '') + '`.'
		} else {
			// Multiple channels, list them
			response += '{channel name}' + (includeMention ? ' @{user}' : '') + '`.'
				+ '\nAvailable ' + (type ? `**${type}** ` : '') + `channel names: ${availableChannels.map(channel => ' `' + channel.name + '`')}.`
		}
    }
	await sendResponse(message, response);
}

/**
 * Get a channel using user argument
 * @param queueGuild
 * @param parsed
 * @param message
 * @param includeMention? Include mention in error message
 * @param type Type of channels to fetch ('voice' or 'text')
 */
async function fetchChannel(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message,
	includeMention?: boolean, type?: string): Promise<VoiceChannel | TextChannel> {

	const guild = message.guild;
	const channels = await fetchStoredQueueChannels(guild);

	if (channels.length > 0) {
		// Extract channel name from message
		const availableChannels = type ?
			channels.filter(channel => channel.type === type) :
			channels;

		if (availableChannels.length === 1) {
			return availableChannels[0];
		} else {
			return await findChannel(queueGuild, availableChannels, parsed, message, includeMention, type, true);
		}
	} else {
		await sendResponse(message, `No queue channels set.`
			+ `\nSet a queue first using \`${queueGuild.prefix}${config.queueCmd} {channel name}\`.`
		);
		return null;
	}
}

/**
 * Add bot to a voice channel for swapping
 * @param queueGuild
 * @param parsed
 * @param message Discord message object.
 */
async function start(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {

	const channel = await fetchChannel(queueGuild, parsed, message, false, 'voice');
	if (!channel) return;

	if (channel.permissionsFor(message.guild.me).has('CONNECT')) {
		if (channel.type === 'voice') {
			channel.join().then(connection => {
				if (connection) {
					connection.on('error', () => null); connection.on('failed', () => null); connection.on('disconnect', () => null);

					connection.voice?.setSelfDeaf(true);
					connection.voice?.setSelfMute(true);
                }
			}).catch(null);
		} else {
			await sendResponse(message, 'I can only join voice channels.');
		}
	} else {
		await sendResponse(message, 'I need the permissions to join your voice channel!');
	}
}

/**
 * Create an embed message to display a channel's queue
 * @param queueGuild
 * @param parsed Parsed message - prefix, command, argument.
 * @param message Discord message object.
 * @param queueChannel
 */
async function displayQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message,
	queueChannel?: VoiceChannel | TextChannel): Promise<void> {

	queueChannel = queueChannel || await fetchChannel(queueGuild, parsed, message);
	if (!queueChannel) return;

	const displayChannel = message.channel as TextChannel;

	if (displayChannel.permissionsFor(message.guild.me).has('SEND_MESSAGES')
		&& displayChannel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {

		const embedList = await generateEmbed(queueGuild, queueChannel);
		// Remove old display
		await removeStoredDisplays(queueChannel.id, displayChannel.id);
		// Create new display
		await addStoredDisplays(queueChannel, displayChannel, embedList);
	} else {
		message.author.send(`I don't have permission to write messages and embeds in \`${displayChannel.name}\`.`)
			.catch(() => null);
    }
}

/**
 * Toggle a channel's queue status. Display existing queues if no argument is provided.
 * @param queueGuild
 * @param parsed Parsed message - prefix, command, argument.
 * @param message Discord message object.
 */
async function setQueueChannel(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {

	// Setup common variables
	const parsedArgs = parsed.arguments;
	const guild = message.guild;
	// Get stored queue channel list from database
	const storedChannels = await fetchStoredQueueChannels(guild);
	// Channel argument provided. Toggle it
	if (parsedArgs) {
		const channels = guild.channels.cache.filter(channel => channel.type !== 'category').array() as VoiceChannel[] | TextChannel[];
		const queueChannel = await findChannel(queueGuild, channels, parsed, message, false, null, true);
		if (!queueChannel) return;

		if (storedChannels.some(storedChannel => storedChannel.id === queueChannel.id)) {
			// Channel is already stored, remove it
			await removeStoredQueueChannel(guild.id, queueChannel.id);
			await sendResponse(message, `Deleted queue for \`${queueChannel.name}\`.`);
		} else {
			// It's not in the list, add it
			await addStoredQueueChannel(queueChannel);
			await displayQueue(queueGuild, parsed, message, queueChannel);
		}
	} else {
		// No argument. Display current queues
		if (storedChannels.length > 0) {
			await sendResponse(message, `Current queues: ${storedChannels.map(ch => ` \`${ch.name}\``)}`);
		} else {
			await sendResponse(message, `No queue channels set.`
				+ `\nSet a new queue channel using \`${queueGuild.prefix}${config.queueCmd} {channel name}\``
				//	+ `\nChannels: ${channels.map(channel => ` \`${channel.name}\``)}`
			);
		}
	}
}

/**
 * Add a member into a text queue
 * @param queueGuild
 * @param parsed Parsed message - prefix, command, argument.
 * @param message Discord message object.
 * @param authorHasPermissionToQueueOthers whether the message author can queue others using mentions.
 */
async function joinTextChannel(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message,
	authorHasPermissionToQueueOthers: boolean): Promise<void> {

	// Get queue channel
	const queueChannel = await fetchChannel(queueGuild, parsed, message, message.mentions.members.size > 0, 'text');
	if (!queueChannel) return;
	// Parse message and members
	const personalMessage = parsed.arguments
		.replace(/(<(@!?|#)\w+>)/gi, '')
		.replace(queueChannel.name, '')
		.substring(0, 128)
		.trim();
	let memberIdsToToggle = [message.member.id];
	if (authorHasPermissionToQueueOthers && message.mentions.members.size > 0) {
		memberIdsToToggle = message.mentions.members.array().map(member => member.id);
	}

	const storedQueueMembers = await knex<QueueMember>('queue_members')
		.where('queue_channel_id', queueChannel.id);

	const memberIdsToAdd: string[] = [];
	const memberIdsToRemove: string[] = [];
	for (const memberId of memberIdsToToggle) {
		if (storedQueueMembers.some(storedMember => storedMember.queue_member_id === memberId)) {
			// Already in queue, set to remove
			memberIdsToRemove.push(memberId);
		} else {
			// Not in queue, set to add
			memberIdsToAdd.push(memberId);
		}
	}

	let messageString = '';
	if (memberIdsToRemove.length > 0) {
		// Remove from queue
		await removeStoredQueueMembers(queueChannel.id, memberIdsToRemove);
		messageString += 'Removed ' + memberIdsToRemove.map(id => `<@!${id}>`).join(', ')
			+ ` from the \`${queueChannel.name}\` queue.\n`;
	}
	if (memberIdsToAdd.length > 0) {
		// Add to queue
		await addStoredQueueMembers(queueChannel.id, memberIdsToAdd, personalMessage);
		messageString += 'Added ' + memberIdsToAdd.map(id => `<@!${id}>`).join(', ')
			+ ` to the \`${queueChannel.name}\` queue.`;
	}


	await sendResponse(message, messageString);
	updateDisplayQueue(queueGuild, [queueChannel]);
}

/**
 * Pop a member from a text channel queue
 * @param queueGuild
 * @param parsed
 * @param message Discord message object.
 */
async function popTextQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {

	const queueChannel = await fetchChannel(queueGuild, parsed, message, false, 'text');
	if (!queueChannel) return;

	if (queueChannel.type !== 'text') {
		await sendResponse(message, `\`${queueGuild.prefix}${config.nextCmd}\` can only be used on text channel queues.`);
	} else {
		// Get the older member entry for the queue
		const nextQueueMemberQuery = knex<QueueMember>('queue_members').where('queue_channel_id', queueChannel.id)
			.orderBy('created_at').first();
		const nextQueueMember = await nextQueueMemberQuery;

		if (nextQueueMember) {
			// Display and remove member from the the queue
			sendResponse(message, `Pulled next user (<@!${nextQueueMember.queue_member_id}>) from \`${queueChannel.name}\`.`);
			await removeStoredQueueMembers(queueChannel.id, [nextQueueMember.queue_member_id]);
			await updateDisplayQueue(queueGuild, [queueChannel]);
		} else {
			sendResponse(message, `\`${queueChannel.name}\` is empty.`);
		}
    }
}

/**
 * Kick a member from a queue
 * @param queueGuild
 * @param parsed
 * @param message Discord message object.
 */
async function kickMember(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {

	// remove user mentions
	parsed.arguments = parsed.arguments.replace(/<@!?\d+>/gi, '').trim();
	// Get queue channel
	const queueChannel = await fetchChannel(queueGuild, parsed, message, message.mentions.members.size > 0, 'text');
	if (!queueChannel) return;
	// Parse message and members
	const memberIdsToKick = message.mentions.members.array().map(member => member.id);
	if (!memberIdsToKick || memberIdsToKick.length === 0) return;

	let updateDisplays = false;
	await getLock(membersLocks, queueChannel.id).runExclusive(async () => {
		const storedQueueMembersQuery = knex<QueueMember>('queue_members')
			.where('queue_channel_id', queueChannel.id)
			.whereIn('queue_member_id', memberIdsToKick);
		const storedQueueMemberIds = (await storedQueueMembersQuery).map(member => member.queue_member_id);

		if (storedQueueMemberIds && storedQueueMemberIds.length > 0) {
			updateDisplays = true;
			// Remove from queue
			await storedQueueMembersQuery.del();
			await sendResponse(message, 'Kicked ' + storedQueueMemberIds.map(id => `<@!${id}>`).join(', ')
				+ ` from the \`${queueChannel.name}\` queue.`);
		}
	});
	if (updateDisplays) await updateDisplayQueue(queueGuild, [queueChannel]);
}

/**
 * Shuffle using the Fisher-Yates algorithm
 * @param array items to shuffle
 */
function shuffleArray(array: string[]): void {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

/**
 * Shuffles a queue
 * @param queueGuild
 * @param parsed
 * @param message Discord message object.
 */
async function shuffleQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {
	const queueChannel = await fetchChannel(queueGuild, parsed, message);
	if (!queueChannel) return;

	await getLock(membersLocks, queueChannel.id).runExclusive(async () => {
		const queueMembersQuery = knex<QueueMember>('queue_members').where('queue_channel_id', queueChannel.id);
		const queueMembers = await queueMembersQuery;
		const queueMemberTimeStamps = queueMembers.map(member => member.created_at);
		shuffleArray(queueMemberTimeStamps);
		for (let i = 0; i < queueMembers.length; i++) {
			await knex<QueueMember>('queue_members').where('id', queueMembers[i].id)
				.update('created_at', queueMemberTimeStamps[i]);
        }
	});
	await updateDisplayQueue(queueGuild, [queueChannel]);
	await sendResponse(message, `\`${queueChannel.name}\` queue shuffled.`);
}

/**
 * Pop a member from a text channel queue
 * @param queueGuild
 * @param parsed
 * @param message Discord message object.
 */
async function clearQueue(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {

	const queueChannel = await fetchChannel(queueGuild, parsed, message);
	if (!queueChannel) return;

	await removeStoredQueueMembers(queueChannel.id);
	await updateDisplayQueue(queueGuild, [queueChannel]);
	await sendResponse(message, `\`${queueChannel.name}\` queue cleared.`);
}

/**
 * Send a help embed
 * @param queueGuild
 * @param parsed
 * @param message Discord message object.
 */
async function help(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message): Promise<void> {

	const storedPrefix = queueGuild.prefix;
	const storedColor = queueGuild.color;

	const embeds: {}[] = [
        {
            'embed': {
                'title': 'Non-Restricted Commands',
                'color': storedColor,
                'author': {
                    'name': 'Queue Bot',
                    'url': 'https://top.gg/bot/679018301543677959',
                    'iconUrl': 'https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/icon.png'
                },
                'fields': [
                    {
                        'name': 'Access',
                        'value': 'Available to everyone.'
                    },
                    {
                        'name': 'Join a Text Channel Queue',
						'value': `\`${storedPrefix}${config.joinCmd} {channel name} {OPTIONAL: message to display next to your name}\` joins or leaves a text channel queue.`
					}
                ]
            }
		},
        {
            'embed': {
                'title': 'Restricted Commands',
				'color': storedColor,
				'image': {
					'url': 'https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/example.gif'
				},
				'fields': [
                    {
						'name': 'Access',
						'value': 'Available to owners or users with `queue mod`, `mod` or `admin` in their server roles.'
                    },
                    {
						'name': 'Modify & View Queues',
						'value': `\`${storedPrefix}${config.queueCmd} {channel name}\` creates a new queue or deletes an existing queue.`
							+ `\n\`${storedPrefix}${config.queueCmd}\` shows the existing queues.`
                    },
                    {
                        'name': 'Display Queue Members',
                        'value': `\`${storedPrefix}${config.displayCmd} {channel name}\` displays the members in a queue. These messages stay updated.`
                    },
                    {
                        'name': 'Pull Users from Voice Queue',
                        'value': `\`${storedPrefix}${config.startCmd} {channel name}\` adds the bot to a queue voice channel.`
                            + ` The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue.`
                            + ` Right-click the bot to disconnect it from the voice channel when done. See the example gif below.`
                    },
                    {
                        'name': 'Pull Users from Text Queue',
                        'value': `\`${storedPrefix}${config.nextCmd} {channel name}\` removes the next person in the text queue and displays their name.`
                    },
                    {
                        'name': 'Add Others to a Text Channel Queue',
                        'value': `\`${storedPrefix}${config.joinCmd} {channel name} @{user 1} @{user 2} ...\` adds other people from text channel queue.`
                    },
                    {
                        'name': 'Kick Users from Queue',
                        'value': `\`${storedPrefix}${config.kickCmd} {channel name} @{user 1} @{user 2} ...\` kicks one or more people from a queue.`
                    },
                    {
                        'name': 'Clear Queue',
                        'value': `\`${storedPrefix}${config.clearCmd} {channel name}\` clears a queue.`
					},
					{
						'name': 'Shuffle Queue',
						'value': `\`${storedPrefix}${config.shuffleCmd} {channel name}\` shuffles a queue.`
					},
                    {
                        'name': 'Change the Grace Period',
                        'value': `\`${storedPrefix}${config.gracePeriodCmd} {time in seconds}\` changes how long a person can leave a queue before being removed.`
                    },
                    {
                        'name': 'Change the Command Prefix',
                        'value': `\`${storedPrefix}${config.prefixCmd} {new prefix}\` changes the prefix for commands.`
                    },
                    {
                        'name': 'Change the Color',
                        'value': `\`${storedPrefix}${config.colorCmd} {new color}\` changes the color of bot messages.`
					},
					{
						'name': 'Change the Display Mode',
						'value': `\`${storedPrefix}${config.modeCmd} {new mode}\` changes how the display messages are updated.`
							+ `\n\`${storedPrefix}${config.modeCmd}\` displays the different update modes.`
					}
                ]
            }
        }
	];

	const availableChannels = message.guild.channels.cache.array() as (VoiceChannel | TextChannel)[];
	const channel = await findChannel(queueGuild, availableChannels, parsed, message, false, 'text') as TextChannel;

	if (parsed.arguments && channel) {
		if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
			// Channel found and bot has permission, print.
			embeds.forEach(em => channel.send(em).catch(() => null));
		} else {
			// Channel found, but no permission. Send permission and help messages to user.
			message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``)
				.catch(() => null);
		}
	} else {
		// No channel provided. Send help to user.
		embeds.map(em => {
			message.author.send(em).catch(() => null)
		});

		await sendResponse(message, 'I have sent help to your PMs.');
	}
}

/**
 * Change a server setting
 * @param queueGuild
 * @param parsed
 * @param message Discord message object.
 * @param passesValueRestrictions Test to determine whether the user input is valid.
 * @param extraErrorLine Extra hint to display if the user gives invalid input.
 * @param embed Embed to display with extra error line.
 */
async function setServerSettings(queueGuild: QueueGuild, parsed: ParsedArguments, message: Message,
	passesValueRestrictions: boolean, extraErrorLine?: string, embed?: {}): Promise<void> {

	// Setup common variables
	const setting = ServerSettings[parsed.command];
	const guild = message.guild;
	const channels = await fetchStoredQueueChannels(guild);
	
	if (parsed.arguments && passesValueRestrictions) {
		// Store channel to database
		await knex<QueueGuild>('queue_guilds').where('guild_id', message.guild.id).first()
			.update(setting.dbVariable, parsed.arguments);
		queueGuild[setting.dbVariable] = parsed.arguments;
		await updateDisplayQueue(queueGuild, channels);
		await sendResponse(message, `Set \`${setting.str}\` to \`${parsed.arguments}\`.`);
	} else {
		await sendResponse(message, {
			'embed': embed,
			'content':
				`The ${setting.str} is currently set to \`${queueGuild[setting.dbVariable]}\`.\n`
				+ `Set a new ${setting.str} using \`${queueGuild.prefix}${parsed.command} {${setting.str}}\`.\n`
				+ extraErrorLine
		});
	}
}

/**
 * Determine whether user has permission to interact with bot
 * @param message Discord message object.
 */
async function checkPermission(message: Message): Promise<boolean> {

	const regex = RegExp(config.permissionsRegexp, 'i');
	return message.member.roles.cache.some(role => regex.test(role.name)) || message.member.id === message.guild.ownerID;
}

/**
 * 
 * @param guildId
 */
async function createDefaultGuild(guildId: string): Promise<QueueGuild> {

	await knex<QueueGuild>('queue_guilds').insert({
		guild_id: guildId,
		grace_period: '0',
		prefix: config.prefix,
		color: '#51ff7e',
		msg_mode: 1
	});
	return await knex<QueueGuild>('queue_guilds').where('guild_id', guildId).first();
}

interface ParsedArguments {
	command: string;
	arguments: string;
}

client.on('message', async message => {

	if (message.author.bot) return;
	const guildId = message.guild.id;
	// NOTE: DO NOT USE queue_channel_ids from the variable. Lock first, then call knex<GuildQueue>('queue_guilds').
	const queueGuild = await knex<QueueGuild>('queue_guilds').where('guild_id', guildId).first()
		|| await createDefaultGuild(guildId);

	const parsed: ParsedArguments = { command: null, arguments: null };
	if (message.content.startsWith(queueGuild.prefix)) {
		// Parse the message
		// Note: prefix can contain spaces. Command can not contains spaces. parsedArgs can contain spaces.
		parsed.command = message.content.substring(queueGuild.prefix.length).split(' ')[0];
		parsed.arguments = message.content.substring(queueGuild.prefix.length + parsed.command.length + 1).trim();
		const hasPermission = await checkPermission(message);
		// Restricted commands
		if (hasPermission) {
			switch (parsed.command) {
				// Start
				case config.startCmd:
					start(queueGuild, parsed, message);
					break;
				// Display
				case config.displayCmd:
					displayQueue(queueGuild, parsed, message);
					break;
				// Set Queue
				case config.queueCmd:
					setQueueChannel(queueGuild, parsed, message);
					break;
				// Pop next user
				case config.nextCmd:
					popTextQueue(queueGuild, parsed, message);
					break;
				// Pop next user
				case config.kickCmd:
					kickMember(queueGuild, parsed, message);
					break;
				// Clear queue
				case config.clearCmd:
					clearQueue(queueGuild, parsed, message);
					break;
				// Shuffle queue
				case config.shuffleCmd:
					shuffleQueue(queueGuild, parsed, message);
					break;

				// Grace period
				case config.gracePeriodCmd:
					setServerSettings(queueGuild, parsed, message,
						+parsed.arguments >= 0 && +parsed.arguments <= 6000,
						'Grace period must be between `0` and `6000` seconds.'
					);
					break;
				// Prefix
				case config.prefixCmd:
					setServerSettings(queueGuild, parsed, message,
						true,
					);
					break;
				// Color
				case config.colorCmd:
					setServerSettings(queueGuild, parsed, message,
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
					setServerSettings(queueGuild, parsed, message,
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
				help(queueGuild, parsed, message);
				break;
			// Join Text Queue
			case config.joinCmd:
				joinTextChannel(queueGuild, parsed, message, hasPermission);
				break;
		}
	} else if (message.content === config.prefix + config.helpCmd) {
		// Default help command
		help(queueGuild, parsed, message);
	}
});

async function resumeQueueAfterOffline() {
	const storedQueueGuildsQuery = knex<QueueGuild>('queue_guilds');
	const storedQueueGuilds = await storedQueueGuildsQuery;
	for (const storedQueueGuild of storedQueueGuilds) {
		try {
			const guild = await client.guilds.fetch(storedQueueGuild.guild_id);

			if (guild) {
				const storedQueueChannelsQuery = knex<QueueChannel>('queue_channels').where('guild_id', guild.id);
				const storedQueueChannels = await storedQueueChannelsQuery;
				for (const storedQueueChannel of storedQueueChannels) {
					const queueChannel = guild.channels.cache.get(storedQueueChannel.queue_channel_id) as TextChannel | VoiceChannel;
					if (queueChannel) {
						if (queueChannel.type !== 'voice') continue;

						// Fetch stored and live members
						const storedQueueMembersQuery = knex<QueueMember>('queue_members').where('queue_channel_id', queueChannel.id);
						const storedQueueMemberIds = (await storedQueueMembersQuery).map(member => member.queue_member_id);
						const queueMemberIds = queueChannel.members.filter(member => !member.user.bot).keyArray();

						// Update member lists
						for (const storedQueueMemberId of storedQueueMemberIds) {
							if (!queueMemberIds.includes(storedQueueMemberId)) {
								await storedQueueMembersQuery.where('queue_member_id', storedQueueMemberId).del();
							}
						}
						for (const queueMemberId of queueMemberIds) {
							if (!storedQueueMemberIds.includes(queueMemberId)) {
								await storedQueueMembersQuery.insert({
									queue_channel_id: queueChannel.id,
									queue_member_id: queueMemberId
								});
							}
						}
						// Update displays
						await updateDisplayQueue(storedQueueGuild, [queueChannel]);
					} else {
						// Cleanup deleted queue channels
						await removeStoredQueueChannel(guild.id, storedQueueChannel.queue_channel_id);
					}
				}
			} else {
				// Cleanup deleted guilds
				await storedQueueGuildsQuery.where('guild_id', storedQueueGuild.guild_id).del();
				await removeStoredQueueChannel(storedQueueGuild.guild_id);
			}
		} catch (e) {
			// SKIP
        }
	}
}

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once('ready', async () => {

	// Create a table
	await knex.schema.hasTable('queue_guilds').then(exists => {
		if (!exists) knex.schema.createTable('queue_guilds', table => {
			table.text('guild_id').primary();
			table.text('grace_period');
			table.text('prefix');
			table.text('color');
			table.integer('msg_mode');
		}).catch(e => console.error(e));
	});
	await knex.schema.hasTable('queue_channels').then(exists => {
		if (!exists) knex.schema.createTable('queue_channels', table => {
			table.text('queue_channel_id').primary();
			table.text('guild_id');
		}).catch(e => console.error(e));
	});
	await knex.schema.hasTable('queue_members').then(exists => {
		if (!exists) knex.schema.createTable('queue_members', table => {
			table.increments('id').primary();
			table.text('queue_channel_id');
			table.text('queue_member_id');
			table.text('personal_message');
			table.timestamp('created_at').defaultTo(knex.fn.now());
		}).catch(e => console.error(e));
	});
	await knex.schema.hasTable('display_channels').then(exists => {
		if (!exists) knex.schema.createTable('display_channels', table => {
			table.increments('id').primary();
			table.text('queue_channel_id');
			table.text('display_channel_id');
			table.text('embed_id');
		}).catch(e => console.error(e));
	});

	// Migration of msg_on_update to msg_mode
	if (await knex.schema.hasColumn('queue_guilds', 'msg_on_update')) {
		console.log('Migrating message mode');
		await knex.schema.table('queue_guilds', table => table.integer('msg_mode'));
		(await knex<QueueGuild>('queue_guilds')).forEach(async queueGuild => {
			await knex<QueueGuild>('queue_guilds').where('guild_id', queueGuild.guild_id)
				.update('msg_mode', queueGuild['msg_on_update'] ? 2 : 1);
		})
		await knex.schema.table('queue_guilds', table => table.dropColumn('msg_on_update'));
	}

	// Migration of msg_on_update to msg_mode
	if (await knex.schema.hasColumn('display_channels', 'embed_ids')) {
		console.log('Migrating display embed ids');
		await knex.schema.table('display_channels', table => table.text('embed_id'));
		(await knex<DisplayChannel>('display_channels')).forEach(async displayChannel => {
			await knex<DisplayChannel>('display_channels')
				.where('display_channel_id', displayChannel.display_channel_id)
				.where('queue_channel_id', displayChannel.queue_channel_id)
				.update('embed_id', displayChannel['embed_ids'][0]);
		})
		await knex.schema.table('display_channels', table => table.dropColumn('embed_ids'));
	}

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
	await removeStoredQueueMembers(oldVoiceChannel.id, [member.id]);
	returningMembersCache.set(oldVoiceChannel.id + '.' + member.id, {
		member: storedQueueMember,
		time: Date.now()
	});
}

// Monitor for users joining voice channels
client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
	const oldVoiceChannel = oldVoiceState.channel;
	const newVoiceChannel = newVoiceState.channel;

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

		const channelsToUpdate: VoiceChannel[] =  [];

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
				await addStoredQueueMembers(newVoiceChannel.id, [member.id]);
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
					await removeStoredQueueMembers(oldVoiceChannel.id, [member.id]);
				} else {
					// Otherwise, cache it
					await markLeavingMember(member, oldVoiceChannel);
				}
			}
			channelsToUpdate.push(oldVoiceChannel);
		}
		if (channelsToUpdate.length > 0) {
			updateDisplayQueue(queueGuild, channelsToUpdate);
		}
	}
});