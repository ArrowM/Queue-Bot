// Read Config file
import {
	token,

	color,
	databaseType,
	databaseUri,
	databaseUsername,
	databasePassword,
	gracePeriod,
	permissionsRegexp,
	prefix,

	clearCmd,
	colorCmd,
	commandPrefixCmd,
	displayCmd,
	gracePeriodCmd,
	helpCmd,
	joinCmd,
	kickCmd,
	nextCmd,
	queueCmd,
	shuffleCmd,
	startCmd
} from "./config.json";

// Setup client
require('events').EventEmitter.defaultMaxListeners = 40; // Maximum number of events that can be handled at once.
import { Client, Guild, Message, TextChannel, VoiceChannel, GuildMember, VoiceConnection, DiscordAPIError, MessageEmbed, EmbedField } from 'discord.js';
const client = new Client({ ws: { intents: ['GUILDS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES'] } });

// Default DB Settings
const defaultDBData = [gracePeriod, prefix, color, "", "", "", "", "", "", ""];
const ServerSettings = {
	[gracePeriodCmd]: { index: 0, str: "grace period" },
	[commandPrefixCmd]: { index: 1, str: "command prefix" },
	[colorCmd]: { index: 2, str: "color" },
};
Object.freeze(ServerSettings);

// Keyv long term DB storage
import Keyv from 'keyv';
const channelDict: Keyv<string[]>  = new Keyv(`${databaseType}://${databaseUsername}:${databasePassword}@${databaseUri}`);	// guild.id | gracePeriod, [voice Channel.id, ...]
channelDict.on('error', (err: Error) => console.error('Keyv connection error:', err));

// Short term storage
const guildMemberDict: { id: string; msg: string }[][][] = [];		// guild.id | GuildChannel.id | [{id: guildMember.id, msg: string}, ...]
const displayEmbedDict: string[][][][] = [];	// guild.id | GuildChannel.id | display GuildChannel.id | [message.id, ...]

// Storage Mutexes
import { Mutex } from 'async-mutex';
const channelLocks = new Map();	// Map<guild.id, MutexInterface>;
const guildMemberLocks = new Map();		// Map<guild.id, MutexInterface>;
const displayEmbedLocks = new Map();	// Map<guild.id, MutexInterface>;

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function setupLocks(guildId: string): Promise<void> {

	channelLocks.set(guildId, new Mutex());
	guildMemberLocks.set(guildId, new Mutex());
	displayEmbedLocks.set(guildId, new Mutex());
}

async function fetchStoredChannels(dbData: string[], guild: Guild): Promise<(VoiceChannel | TextChannel)[]> {

	const channels = [];
	for (let i = 10; i < dbData.length; i++) {
		const channel = guild.channels.cache.get(dbData[i]) as TextChannel | VoiceChannel;
		if (channel) {
			channels.push(channel);
		}
		else {
			dbData.splice(i, 1);
		}
	}
	await channelDict.set(guild.id, dbData);
	return channels;
}

/**
 * Return a grace period in string form
 *
 * @param {number} guildId Guild id.
 * @return {Promise<string>} Grace period string.
 */
const gracePeriodCache = new Map();
async function getGracePeriodString(gracePeriod: string): Promise<string> {

	if (!gracePeriodCache.has(gracePeriod)) {
		let result;
		if (gracePeriod === '0') {
			result = '';
		}
		else {
			const graceMinutes = Math.round(gracePeriod as unknown as number / 60);
			const graceSeconds = gracePeriod as unknown as number % 60;
			const timeString = (graceMinutes > 0 ? graceMinutes + ' minute' : '') + (graceMinutes > 1 ? 's' : '')
				+ (graceMinutes > 0 && graceSeconds > 0 ? ' and ' : '')
				+ (graceSeconds > 0 ? graceSeconds + ' second' : '') + (graceSeconds > 1 ? 's' : '');
			result = ` If you leave, you have ${timeString} to rejoin before being removed from the queue.`
		}
		gracePeriodCache.set(gracePeriod, result);
	}
	return gracePeriodCache.get(gracePeriod);
}

/**
 * Create an Embed to represent everyone in a singl queue. Will create multiple embeds for large queues
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {VoiceChannel} channel Discord message object.
 * @return {Promise<MessageEmbed[]>[]} Array of display embeds
 */
async function generateEmbed(dbData: string[], channel: TextChannel | VoiceChannel): Promise<Partial<MessageEmbed>[]> {

	const prefix = dbData[1];
	const storedColor = dbData[2];
	let embedList: Partial<MessageEmbed>[];
	await guildMemberLocks.get(channel.guild.id).runExclusive(async () => {
		const queueMembers: { id: string; msg: string }[] = guildMemberDict[channel.guild.id][channel.id];
		embedList = [{
			"title": `${channel.name} queue`,
			"color": storedColor as unknown as number,
			"description":
				channel.type === 'voice' ?
					// Voice
					`Join the **${channel.name}** voice channel to join this queue.` + await getGracePeriodString(dbData[0]) :
					// Text
					`Type \`${prefix}${joinCmd} ${channel.name}\` to join or leave this queue.`,
			"fields": [{
				"inline": false,
				"name": `Current queue length: **${queueMembers ? queueMembers.length : 0}**`,
				"value": "\u200b"
			}]
		}];
		// Handle empty queue
		if (!queueMembers || queueMembers.length === 0) {
			embedList[0]['fields'][0]['value'] = 'No members in queue.';
		}
		// Handle non-empty
		else {
			const maxEmbedSize = 1;
			let position = 0;					// 0 , 24, 49, 74
			let sliceStop = maxEmbedSize - 1;	// 24, 49, 74, 99 
			for (let i = 0; i <= queueMembers.length / maxEmbedSize; i++) {
				if (i > 0) { // Creating additional embed after the first embed
					embedList.push({
						"title": null,
						"color": storedColor as unknown as number,
						"description": null,
						"fields": []
					});
				}

				// Populate with names and numbers
				const fields: EmbedField[] = [];
				queueMembers.slice(position, sliceStop).map(queueMember => {
					const member = channel.guild.members.cache.get(queueMember.id);
					if (member) {
						fields.push({
							"inline": false,
							"name": ++position as unknown as string,
							"value": member.displayName + (queueMember.msg ? ' -- ' + queueMember.msg : '')
						});
					}
					// Clean up people who have left the server
					else {
						queueMembers.splice(queueMembers.findIndex(member => member.id === queueMember.id), 1);
					}
				});
				embedList[i]['fields'] = fields;

				sliceStop += maxEmbedSize;
			}
		}
	});
	return embedList;
}

/**
 * Update a server's display messages
 *
 * @param {Guild} guild Guild containing display messages
 * @param {VoiceChannel[]} queues Channels to update
 */
async function updateDisplayQueue(guild: Guild, queues: (VoiceChannel | TextChannel)[]): Promise<void> {
	const currentChannelIds = guild.channels.cache.map(channel => channel.id);
	const dbData = await channelDict.get(guild.id);

	await displayEmbedLocks.get(guild.id).runExclusive(async () => {
		if (displayEmbedDict[guild.id]) {
			// For each updated queue
			for (const queue of queues) {
				if (queue && displayEmbedDict[guild.id][queue.id]) {
					// Create an embed list
					const embedList = await generateEmbed(dbData, queue);
					// For each embed list of the queue
					for (const textChannelId of Object.keys(displayEmbedDict[guild.id][queue.id])) {
						// Handled deleted queue channels
						if (currentChannelIds.includes(textChannelId)) {
							// Retrieved the stored embed list
							const storedEmbeds = Object.values(displayEmbedDict[guild.id][queue.id][textChannelId])
								.map((msgId: unknown) => (guild.channels.cache.get(textChannelId) as TextChannel)
									.messages.cache.get(msgId as string)
								);

							let createNewEmbed = false;
							// If the new embed list and stored embed list are the same length, replace the old embeds via edit
							if (storedEmbeds.length === embedList.length) {
								for (let i = 0; i < embedList.length; i++) {
									if (storedEmbeds[i]) {
										await storedEmbeds[i].edit({ embed: embedList[i] }).catch(() => createNewEmbed = true);
									}
									else {
										createNewEmbed = true;
									}
								}
							}
							// If the new embed list and stored embed list are diffent lengths, delete the old embeds and create all new messages
							if (storedEmbeds.length !== embedList.length || createNewEmbed) {
								const textChannel = guild.channels.cache.get(textChannelId) as TextChannel;
								// Remove the old embed list
								for (const storedEmbed of Object.values(storedEmbeds)) {
									if (storedEmbed) await storedEmbed.delete().catch(() => null);;
								}
								displayEmbedDict[guild.id][queue.id][textChannelId] = [];
								// Create a new embed list
								embedList.forEach(queueEmbed => {
									textChannel.send({ embed: queueEmbed })
										.then((msg: Message) => displayEmbedDict[guild.id][queue.id][textChannelId].push(msg.id))
										.catch((e: DiscordAPIError) => console.log('Error in updateDisplayQueue: ' + e))
								});
							}
						}
						else {
							// Remove stored displays of deleted queue channels
							delete displayEmbedDict[guild.id][queue.id];
						}
					}
				}
			}
		}
	});
}

/**
 * Send message
 *
 * @param {Message} message Object that sends message.
 * @param {any} messageToSend String to send.
 */
async function send(message: Message, messageToSend: {}): Promise<Message> {

	const channel = message.channel as TextChannel;
	if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
		return message.channel.send(messageToSend);
	} else {
		return message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``);
    }
}

/**
 * Watch a user after they leave queue. Remove them once the grace period is reached
 *
 * @param {GuildMember} member Member to watch
 * @param {Guild} guild Guild containing queue
 * @param {VoiceChannel} oldVoiceChannel Queue channel being left 
 */
async function checkAfterLeaving(member: GuildMember, guild: Guild, oldVoiceChannel: VoiceChannel, immediateUpdate: boolean): Promise<void>{

	// console.log(`[${guild.name}] | [${member.displayName}] set to leave [${oldVoiceChannel.name}] queue in ${gracePeriod} seconds`);
	const gracePeriod = (await channelDict.get(guild.id))[0] as unknown as number;
	let timer = 0;
	// Check every 2 seconds
	if (!immediateUpdate) while (timer < gracePeriod) {
		await sleep(2000);
		if (member.voice.channel === oldVoiceChannel) return;
		timer += 2;
	}

	const guildMembers = guildMemberDict[guild.id][oldVoiceChannel.id];
	await guildMemberLocks.get(guild.id).runExclusive(async () => {
		if (guildMembers) {
			// User left channel, remove from queue
			guildMembers.splice(guildMembers.findIndex((queueMember: { id: string; msg: string }) =>
					queueMember.id === member.id), 1); 
		}
	});
	// console.log(`[${guild.name}] | [${member.displayName}] left [${oldVoiceChannel.name}] queue`);
	updateDisplayQueue(guild, [oldVoiceChannel]);
}

/**
 * Extracts a channel from command arguments. Starting with the largest matching substring
 * @param {(VoiceChannel | TextChannel)[]} availableChannels
 * @param {ParsedArguments} parsed
 * @param {Message} message
 * @return {VoiceChannel | TextChannel}
 */
function extractChannel(availableChannels: (VoiceChannel | TextChannel)[], parsed: ParsedArguments, message: Message): VoiceChannel | TextChannel  {
	let channel = availableChannels.find(channel => channel.id === message.mentions.channels.array()[0]?.id);
	const splitArgs = parsed.arguments.split(' ');
	for (let i = splitArgs.length; i > 0; i--) {
		if (channel) break;
		const channelNameToCheck = splitArgs.slice(0, i).join(' ');
		channel = availableChannels.find(channel => channel.name === channelNameToCheck) ||
			availableChannels.find(channel => channel.name.localeCompare(channelNameToCheck, undefined, { sensitivity: 'accent' }) === 0);
	}
	return channel;
}

/**
 * Get a channel from available channels
 * 
 * @param {(VoiceChannel | TextChannel)[]} availableChannels
 * @param {ParsedArguments} parsed
 * @param {boolean} includeMention Include mention in error message
 * @param {string} type Type of channels to fetch ('voice' or 'text')
 * @param {Message} message
 */
async function findChannel(availableChannels: (VoiceChannel | TextChannel)[], parsed: ParsedArguments,
	message: Message, includeMention: boolean, type: string, errorOnNoneFound: boolean): Promise<VoiceChannel | TextChannel> {

	const channel = extractChannel(availableChannels, parsed, message);
	if (channel) return channel;

	if (errorOnNoneFound) {
		let response;
		if (availableChannels.length === 0) {
			response = 'No ' + (type ? `**${type}** ` : '') + 'queue channels set.'
				+ '\nSet a ' + (type ? `${type} ` : '') + `queue first using \`${prefix}${queueCmd} {channel name}\``;
		}
		else {
			response = 'Invalid ' + (type ? `**${type}** ` : '') + `channel name! Try \`${parsed.prefix}${parsed.command} `;
			if (availableChannels.length === 1) {
				// Single channel, recommend the single channel
				response += availableChannels[0].name + (includeMention ? ' @{user}' : '') + '`.'
			}
			else {
				// Multiple channels, list them
				response += '{channel name}' + (includeMention ? ' @{user}' : '') + '`.'
					+ '\nAvailable ' + (type ? `**${type}** ` : '') + `channel names: ${availableChannels.map(channel => ' `' + channel.name + '`')}`
			}
        }
		send(message, response);
    }
}

/**
 * Get a channel using user argument
 *
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 * @param {boolean} includeMention Include mention in error message
 * @param {string} type Type of channels to fetch ('voice' or 'text')
 * @return {GuildChannel} Matched channel.
 */
async function fetchChannel(dbData: string[], parsed: ParsedArguments,
	message: Message, includeMention: boolean, type?: string): Promise<VoiceChannel | TextChannel> {

	const channels = await fetchStoredChannels(dbData, message.guild);
	const guild = message.guild;

	if (guildMemberDict[guild.id] && channels.length > 0) {
		// Extract channel name from message

		const availableChannels = type ?
			channels.filter(channel => channel.type === type) :
			channels;

		if (availableChannels.length === 1) {
			return availableChannels[0];
		}
		else {
			return await findChannel(availableChannels, parsed, message, includeMention, type, true);
		}
	}
	else {
		send(message, `No queue channels set.`
			+ `\nSet a queue first using \`${parsed.prefix}${queueCmd} {channel name}\``
		);
		return null;
	}
}

/**
 * Add bot to a voice channel for swapping
 *
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function start(dbData: string[], parsed: ParsedArguments, message: Message): Promise<void> {
	const channel = await fetchChannel(dbData, parsed, message, false, 'voice');
	if (channel) {
		if (!channel.permissionsFor(message.guild.me).has('CONNECT')) {
			send(message, 'I need the permissions to join your voice channel!');
		}
		else if (channel.type === 'voice') {
			await channel.join()
				.then((connection: void | VoiceConnection) => {	if (connection) connection.voice.setSelfMute(true) })
				.catch((e: DiscordAPIError) => console.log('Error in start: ' + e));
		}
		else {
			send(message, "I can only join voice channels.");
		}
    }
}

/**
 * Create an embed message to display a channel's queue
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function displayQueue(dbData: string[], parsed: ParsedArguments, message: Message): Promise<void> {

	const guild = message.guild;
	const textChannel = message.channel as TextChannel;
	const channel = await fetchChannel(dbData, parsed, message, false);

	if (channel) {
		const embedList = await generateEmbed(dbData, channel);
		await displayEmbedLocks.get(guild.id).runExclusive(async () => {

			// Initialize display message queue
			displayEmbedDict[guild.id] = displayEmbedDict[guild.id] || [];
			displayEmbedDict[guild.id][channel.id] = displayEmbedDict[guild.id][channel.id] || [];

			// Remove old embed lists
			const embedIds = displayEmbedDict[guild.id][channel.id][textChannel.id];
			if (embedIds) for (const embedId of embedIds) {
				const embed = (guild.channels.cache.get(textChannel.id) as TextChannel)?.messages.cache.get(embedId);
				if (embed) await embed.delete().catch(() => null);;
			}

			// Create new display list
			displayEmbedDict[guild.id][channel.id][textChannel.id] = [];
			// Send message and store it
			embedList.forEach(queueEmbed =>
				send(message, { embed: queueEmbed })
				.then(msg => {displayEmbedDict[guild.id][channel.id][textChannel.id].push(msg.id)})
				.catch((e: DiscordAPIError) => console.log('Error in displayQueue: ' + e))
			);
		});
	}
}

/**
 * Toggle a channel's queue status. Display existing queues if no argument is provided.
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function setQueueChannel(dbData: string[], parsed: ParsedArguments, message: Message): Promise<void>{
	// Setup common variables
	const prefix = parsed.prefix;
	const parsedArgs = parsed.arguments;
	const guild = message.guild;
	const channels = guild.channels.cache.filter(channel => channel.type !== 'category').array() as VoiceChannel[] | TextChannel[];
	// Get stored voice channel list from database
	const otherData = dbData.slice(0, 10);
	const storedChannels = await fetchStoredChannels(dbData, message.guild);

	// No argument. Display current queues
	if (!parsedArgs) {
		if (storedChannels.length > 0) {
			send(message, `Current queues: ${storedChannels.map(ch => ` \`${ch.name}\``)}`);
		}
		else {
			send(message, `No queue channels set.`
				+ `\nSet a new queue channel using \`${prefix}${queueCmd} {channel name}\``
			//	+ `\nChannels: ${channels.map(channel => ` \`${channel.name}\``)}`
			);
		}
	}
	// Channel argument provided. Toggle it
	else {
		const channel = await findChannel(channels, parsed, message, false, null, true);
		if (channel) {
			guildMemberLocks.get(guild.id).runExclusive(async () => {
				// Initialize member queue
				guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];
				// Toggle Queue
				if (storedChannels.includes(channel)) { // If it's in the list, remove it
					storedChannels.splice(storedChannels.indexOf(channel), 1);
					delete guildMemberDict[guild.id][channel.id];

					// Remove old embed lists
					await displayEmbedLocks.get(guild.id).runExclusive(async () => {
						if (displayEmbedDict[guild.id] && displayEmbedDict[guild.id][channel.id]) {
							for (const [embedChannelId, embedIds] of displayEmbedDict[guild.id][channel.id].entries()) {
								const embedChannel = guild.channels.cache.get(embedChannelId) as TextChannel;
								if (embedChannel) {
									for (const embedId of embedIds) {
										const embed = embedChannel.messages.cache.get(embedId);
										if (embed) await embed.delete().catch(() => null);;
									}
								}
							}
						}
					});
					send(message, `Deleted queue for \`${channel.name}\`.`);
				}
				else { // If it's not in the list, add it
					storedChannels.push(channel);
					if (channel.type === 'voice') {
						guildMemberDict[guild.id][channel.id] = channel.members
							.filter((member: GuildMember) => !member.user.bot)
							.map((member: GuildMember) => {
								return {id: member.id, msg: null}
							});
					}
					send(message, `Created queue for \`${channel.name}\`.`);
				}
				// Store channel to database
				await channelDict.set(guild.id, otherData.concat(storedChannels.map(ch => ch.id)));
			});
		}
	}
}

/**
 * Add a member into a text queue
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function joinTextChannel(dbData: string[], parsed: ParsedArguments, message: Message, hasPermission: boolean): Promise<void> {
	const guild = message.guild;

	if (hasPermission) {
		parsed.arguments = parsed.arguments.replace(/<@!?\d+>/gi, '').trim(); // remove user mentions
	}
	const membersToAdd = message.mentions.members.size > 0 ? message.mentions.members.array() : [message.member];

	const channel = await fetchChannel(dbData, parsed, message, message.mentions.members.size > 0, 'text');

	if (channel) {
		const customMessage = parsed.arguments.replace(channel.name, '').trim().substring(0, 200);
		await guildMemberLocks.get(guild.id).runExclusive(async () => {
			// Initialize member queue
			guildMemberDict[guild.id][channel.id] = guildMemberDict[guild.id][channel.id] || [];
			const guildMembers = guildMemberDict[guild.id][channel.id];
			for (const member of membersToAdd) {
				if (guildMembers.some((queueMember: { id: string; msg: string }) => queueMember.id === member.id)) {
					// Remove from queue
					guildMembers.splice(guildMembers.findIndex((queueMember: { id: string; msg: string }) =>
						queueMember.id === member.id), 1);
					send(message, `Removed \`${member.displayName}\` from the \`${channel.name}\` queue.`)
				}
				else {
					// Add to queue
					guildMembers.push({id: member.id, msg: customMessage});
					send(message, `Added \`${member.displayName}\` to the \`${channel.name}\` queue.`)
				}
			}
		});
		updateDisplayQueue(guild, [channel]);
	}
}

/**
 * Pop a member from a text channel queue
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function popTextQueue(dbData: string[], parsed: ParsedArguments, message: Message): Promise<void> {
	const guild = message.guild;
	const channel = await fetchChannel(dbData, parsed, message, false, 'text');
	if (channel) {
		const guildMembers = guildMemberDict[guild.id][channel.id];
		if (channel.type === 'text' && guildMembers && guildMembers.length > 0) {
			let nextMemberId;
			await guildMemberLocks.get(guild.id).runExclusive(async () => {
				nextMemberId = guildMembers.shift();
			});
			send(message, `Pulling next user (<@!${nextMemberId}>) from \`${channel.name}\`.`);
			updateDisplayQueue(guild, [channel]);
		}
		else if (channel.type !== 'text') {
			send(message, `\`${parsed.prefix}${nextCmd}\` can only be used on text channel queues.`);
		}
		else if (guildMembers && guildMembers.length === 0) {
			send(message, `\`${channel.name}\` is empty.`);
		}
	}
}

/**
 * Kick a member from a queue
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function kickMember(dbData: string[], parsed: ParsedArguments, message: Message): Promise<void> {

	const guild = message.guild;
	parsed.arguments = parsed.arguments.replace(/<@!?\d+>/gi, '').trim(); // remove user mentions
	const channel = await fetchChannel(dbData, parsed, message, true);
	const mentionedMembers = message.mentions.members.array();

	if (channel) {
		const guildMembers = guildMemberDict[guild.id][channel.id];
		if (mentionedMembers && guildMembers.length > 0) {
			const kickedMemberIds: string[] = [];
			const unfoundMemberIds: string[] = [];
			await guildMemberLocks.get(guild.id).runExclusive(async () => {
				for (const member of mentionedMembers) {
					if (guildMembers.some((queueMember: { id: string; msg: string }) => queueMember.id === member.id)) {
						guildMembers.splice(guildMembers.findIndex((queueMember: { id: string; msg: string }) =>
							queueMember.id === member.id), 1);
						kickedMemberIds.push(member.id);
					} else {
						unfoundMemberIds.push(member.id);
					}
				}
			});
			// Output result of kick
			send(message, 
				((kickedMemberIds.length > 0) ? 'Kicked' + kickedMemberIds.map(m => ` <@!${m}>`) + ` from \`${channel.name}\` queue.` : '')
				+ ((unfoundMemberIds.length > 0) ? '\nDid not find' + unfoundMemberIds.map(m => ` <@!${m}>`) + ` in \`${channel.name}\` queue.` : ''));
			updateDisplayQueue(guild, [channel]);

		} else if (guildMembers.length === 0) {
			send(message, `\`${channel.name}\` is empty.`);
		}
		else if (!mentionedMembers) {
			send(message, `Specify at least one user to kick. For example:`
				+ `\n\`${parsed.prefix}${kickCmd} General @Arrow\``);
		}
	}
}

/**
 * Shuffle using the Fisher-Yates algorithm
 * @param {string[]} array items to shuffle
 */
function shuffleArray(array: string[]): string[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

/**
 * Shuffles a queue
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function shuffleQueue(dbData: string[], parsed: ParsedArguments, message: Message): Promise<void> {
	const guild = message.guild;
	const channel = await fetchChannel(dbData, parsed, message, false);
	if (channel) {
		await guildMemberLocks.get(guild.id).runExclusive(async () => {
			shuffleArray(guildMemberDict[guild.id][channel.id])
		});
		displayQueue(dbData, parsed, message);
		send(message, `\`${channel.name}\` queue shuffled.`);
	}
}

/**
 * Pop a member from a text channel queue
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function clearQueue(dbData: string[], parsed: ParsedArguments, message: Message): Promise<void> {

	const guild = message.guild;
	const channel = await fetchChannel(dbData, parsed, message, false);
	if (channel) {
		await guildMemberLocks.get(guild.id).runExclusive(async () => {
			guildMemberDict[guild.id][channel.id] = [];
		});
		displayQueue(dbData, parsed, message);
		send(message, `\`${channel.name}\` queue cleared.`);
	}
}

/**
 * Send message sender a help embed
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function help(dbData: string[], parsed: ParsedArguments, message: Message): Promise<void> {

	const storedPrefix = parsed.prefix;
	const storedColor = dbData[2];

	const embeds: {}[] = [
        {
            "embed": {
                "title": "Non-Restricted Commands",
                "color": storedColor,
                "author": {
                    "name": "Queue Bot",
                    "url": "https://top.gg/bot/679018301543677959",
                    "iconUrl": "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/icon.png"
                },
                "fields": [
                    {
                        "name": "Access",
                        "value": "Available to everyone."
                    },
                    {
                        "name": "Join a Text Channel Queue",
                        "value": `\`${storedPrefix}${joinCmd} {channel name} {OPTIONAL: message to display next to your name}\` joins or leaves a text channel queue.`
					}
                ]
            }
		},
        {
            "embed": {
                "title": "Restricted Commands",
				"color": storedColor,
				"image": {
					"url": "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/example.gif"
				},
				"fields": [
                    {
						"name": "Access",
						"value": "Available to owners or users with `mod` or `mods` in their server roles."
                    },
                    {
						"name": "Modify & View Queues",
						"value": `\`${storedPrefix}${queueCmd} {channel name}\` creates a new queue or deletes an existing queue.`
							+ `\n\`${storedPrefix}${queueCmd}\` shows the existing queues.`
                    },
                    {
                        "name": "Display Queue Members",
                        "value": `\`${storedPrefix}${displayCmd} {channel name}\` displays the members in a queue. These messages stay updated.`
                    },
                    {
                        "name": "Pull Users from Voice Queue",
                        "value": `\`${storedPrefix}${startCmd} {channel name}\` adds the bot to a queue voice channel.`
                            + ` The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue.`
                            + ` Right-click the bot to disconnect it from the voice channel when done. See the example gif below.`
                    },
                    {
                        "name": "Pull Users from Text Queue",
                        "value": `\`${storedPrefix}${nextCmd} {channel name}\` removes the next person in the text queue and displays their name.`
                    },
                    {
                        "name": "Add Others to a Text Channel Queue",
                        "value": `\`${storedPrefix}${joinCmd} {channel name} @{user 1} @{user 2} ...\` adds other people from text channel queue.`
                    },
                    {
                        "name": "Kick Users from Queue",
                        "value": `\`${storedPrefix}${kickCmd} {channel name} @{user 1} @{user 2} ...\` kicks one or more people from a queue.`
                    },
                    {
                        "name": "Clear Queue",
                        "value": `\`${storedPrefix}${clearCmd} {channel name}\` clears a queue.`
					},
					{
						"name": "Shuffle Queue",
						"value": `\`${storedPrefix}${shuffleCmd} {channel name}\` shuffles a queue.`
					},
                    {
                        "name": "Change the Grace Period",
                        "value": `\`${storedPrefix}${gracePeriodCmd} {time in seconds}\` changes how long a person can leave a queue before being removed.`
                    },
                    {
                        "name": "Change the Command Prefix",
                        "value": `\`${storedPrefix}${commandPrefixCmd} {new prefix}\` changes the prefix for commands.`
                    },
                    {
                        "name": "Change the Color",
                        "value": `\`${storedPrefix}${colorCmd} {new color}\` changes the color of bot messages.`
                    }
                ]
            }
        }
	];

	const channel = await findChannel(message.guild.channels.cache.array() as (VoiceChannel | TextChannel)[],
		parsed, message, false, 'text', false) as TextChannel;
	if (parsed.arguments && channel) {
		if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
			// Channel found and bot has permission, print.
			embeds.forEach(em => channel.send(em)
				.catch(e => console.log(e)));
		} else {
			// Channel found, but no permission. Send permission and help messages to user.
			message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``);
			embeds.forEach(em => message.author.send(em)
				.catch(e => console.log(e)));
		}
	} else {
		// No channel provided. send help to user.
		embeds.map(em => {
			message.author.send(em)
				.catch(e => console.log(e))
		});

		send(message, "I have sent help to your PMs.");
	}
}

/**
 * Change a server setting
 *
 * @param {string[]} dbData Array of server settings stored in DB.
 * @param {ParsedArguments} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 * @param {boolean} updateDisplayMsgs Whether to update existing display messages.
 * @param {function} valueRestrictions Test to determine whether the user input is valid.
 * @param {string} extraErrorLine Extra hint to display if the user gives invalid input.
 * @param {MessageEmbed} embed Embed to display with extra error line.
 */
async function setServerSettings(dbData: string[], parsed: ParsedArguments, message: Message, updateDisplayMsgs: boolean,
	valueRestrictions: boolean, extraErrorLine: string, embed?: {}): Promise<void> {

	// Setup common variables
	const setting = ServerSettings[parsed.command];
	const guild = message.guild;
	const otherData = dbData.slice(0, 10);
	const channels = await fetchStoredChannels(dbData, guild);
	
	if (parsed.arguments && valueRestrictions) {
		otherData[setting.index] = parsed.arguments;
		// Store channel to database
		await channelDict.set(guild.id, otherData.concat(channels.map(ch => ch.id)));
		if (updateDisplayMsgs) updateDisplayQueue(guild, channels);
		send(message, `Set ${setting.str} to \`${parsed.arguments}\`.`);
	}
	else {
		send(message, {
			"embed": embed,
			"content":
				`The ${setting.str} is currently set to \`${dbData[setting.index]}\`.\n`
				+ `Set a new ${setting.str} using \`${parsed.prefix}${parsed.command} {${setting.str}}\`.\n`
				+ extraErrorLine
		});
	}
}

/**
 * Determine whether user has permission to interact with bot
 *
 * @param {Message} message Discord message object.
 */
async function checkPermission(message: Message): Promise<boolean> {

	const regex = RegExp(permissionsRegexp, 'i');
	return message.member.roles.cache.some(role => regex.test(role.name)) || message.member.id === message.guild.ownerID;
}

interface ParsedArguments {
	prefix: string;
	command: string;
	arguments: string;
}

client.on('message', async message => {
	if (message.author.bot) return;
	// Lock
	if (!channelLocks.get(message.guild.id)) await setupLocks(message.guild.id);
	await channelLocks.get(message.guild.id).runExclusive(async () => {

		// Get server settings
		let dbData = await channelDict.get(message.guild.id);
		if (!dbData) {
			// Set defaults for new servers
			dbData = defaultDBData;
			await channelDict.set(message.guild.id, dbData);
		}
		const parsed: ParsedArguments = { prefix: dbData[1], command: null, arguments: null};

		if (message.content.startsWith(parsed.prefix)) {
			// Parse the message
			// Note: Prefix can contain spaces. Command can not contains spaces. parsedArgs can contain spaces.
			parsed.command = message.content.substring(parsed.prefix.length).split(" ")[0];
			parsed.arguments = message.content.substring(parsed.prefix.length + parsed.command.length + 1).trim();
			const hasPermission = await checkPermission(message);
			// Restricted commands
			if (hasPermission) {
				switch (parsed.command) {
					// Start
					case startCmd:
						start(dbData, parsed, message);
						break;
					// Display
					case displayCmd:
						displayQueue(dbData, parsed, message);
						break;
					// Set Queue
					case queueCmd:
						await setQueueChannel(dbData, parsed, message);
						break;
					// Pop next user
					case nextCmd:
						popTextQueue(dbData, parsed, message);
						break;
					// Pop next user
					case kickCmd:
						kickMember(dbData, parsed, message);
						break;
					// Clear queue
					case clearCmd:
						clearQueue(dbData, parsed, message);
						break;
					// Shuffle queue
					case shuffleCmd:
						shuffleQueue(dbData, parsed, message);
						break;

					// Grace period
					case gracePeriodCmd:
						await setServerSettings(dbData, parsed, message,
							true,
							(parsed.arguments as unknown as number) >= 0 && (parsed.arguments as unknown as number) <= 300,
							'Grace period must be between `0` and `300` seconds.'
						);
						break;
					// Command Prefix
					case commandPrefixCmd:
						await setServerSettings(dbData, parsed, message,
							false,
							true,
							''
						);
						break;
					// Color
					case colorCmd:
						await setServerSettings(dbData, parsed, message,
							true,
							/^#?[0-9A-F]{6}$/i.test(parsed.arguments),
							'Use HEX color:',
							{ "title": "Hex color picker", "url": "https://htmlcolorcodes.com/color-picker/", "color": dbData[2]}
						);
						break;
				}
			}
			else if ([startCmd, displayCmd, queueCmd, nextCmd, kickCmd, clearCmd, gracePeriodCmd, commandPrefixCmd, colorCmd].includes(parsed.command)) {
				message.author.send(`You don't have permission to use bot commands in \`${message.guild.name}\`. You must be assigned a \`mod\` or \`admin\` role on the server to use bot commands.`);
            }
			// Commands open to everyone
			switch (parsed.command) {
				// Help
				case helpCmd:
					help(dbData, parsed, message);
					break;
				// Join Text Queue
				case joinCmd:
					await joinTextChannel(dbData, parsed, message, hasPermission);
					break;
			}
		}
		// Default help command
		else if (message.content === prefix + helpCmd) {
			help(dbData, parsed, message);
		}
	});
});

client.login(token);
client.on('error', error => {
	console.error('The WebSocket encountered an error:', error);
});
// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once('ready', async () => {
	for (const guildIdChannelPair of await channelDict.entries()) {
		const guild = client.guilds.cache.get(guildIdChannelPair[0]);
		// Cleanup deleted Guilds
		if (!guild) {
			await channelDict.delete(guildIdChannelPair[0]);
		}
		else {
			// Create locks
			await setupLocks(guild.id);
			// LOCK
			const guildMemberRelease = await guildMemberLocks.get(guild.id).acquire();
			const channelRelease = await channelLocks.get(guild.id).acquire();
			try {
				const dbData = guildIdChannelPair[1];
				const otherData = dbData.slice(0, 10);
				const channels = await fetchStoredChannels(dbData, guild);
				// Set unset values to default
				for (let i = 0; i < otherData.length; i++) {
					otherData[i] = otherData[i] || defaultDBData[i];
				}
				// Initialize member queue
				guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];
				if (channels) for (const channel of channels) {
					if (channel) {
						// Add people already in a voice channel queue
						guildMemberDict[guild.id][channel.id] = (channel.type !== 'voice') ? [] :
							channel.members.filter(member => !member.user.bot).map(member => {
								return { id: member.id, msg: null }
							});
					}
					else {
						// Cleanup deleted Channels
						channels.splice(channels.indexOf(channel), 1);
					}
				}
				await channelDict.set(guild.id, otherData.concat(channels.map(ch => ch.id)));
			}
			finally {
				// UNLOCK
				guildMemberRelease();
				channelRelease();
			}
		}
	}
	if (client && client.user) client.user.setPresence({ activity: { name: `${prefix}${helpCmd} for help` }, status: 'online' });
	console.log('Ready!');
});
client.on('shardResume', async () => {
	for (const guildId of Object.keys(guildMemberDict)) {
		await guildMemberLocks.get(guildId).runExclusive(async () => {
			const availableVoiceChannels = Object.keys(guildMemberDict[guildId]).map(id => client.channels.cache.get(id) as VoiceChannel);
			for (const channel of availableVoiceChannels) {
				// Remove users who left during disconnect
				if (guildMemberDict[guildId][channel]) {
					for (let i = 0; i < guildMemberDict[guildId][channel].length; i++) {
						const memberId = guildMemberDict[guildId][channel][i];
						if (!channel.members.has(memberId)) {
							guildMemberDict[guildId][channel].splice(i, 1); i--;
						}
					}
					if (channel.members) for (const member of channel.members.array()) {
						// Add users who joined during disconnect
						if (!member.user.bot && !guildMemberDict[guildId][channel].includes(member.id)) {
							guildMemberDict[guildId][channel].push({id: member.id, msg: null});
						}
					}
				}
			}
		});
	}
	if (client && client.user) client.user.setPresence({ activity: { name: `${prefix}${helpCmd} for help` }, status: 'online' });
	console.log('Reconnected!');
});


// Monitor for users joining voice channels
client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
	const oldVoiceChannel = oldVoiceState.channel;
	const newVoiceChannel = newVoiceState.channel;

	if (oldVoiceChannel !== newVoiceChannel) {
		const member = newVoiceState.member;
		const guild = newVoiceState.guild;

		if (guildMemberLocks.get(guild.id)) {
			await guildMemberLocks.get(guild.id).runExclusive(async () => {

				// Initialize empty queue if necessary
				guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];

				const availableVoiceChannels = Object.keys(guildMemberDict[guild.id]).map(id => client.channels.cache.get(id));

				if (availableVoiceChannels.includes(newVoiceChannel) || availableVoiceChannels.includes(oldVoiceChannel)) {
					// Bot
					if (member.user.bot) {
						if (newVoiceChannel && !availableVoiceChannels.includes(newVoiceChannel)) { // Prevent pulling people into another queue
							if (guildMemberDict[guild.id][oldVoiceChannel.id].length > 0) {
								// If the use queue is not empty, pull in the next in user queue
								guild.members.cache.get(guildMemberDict[guild.id][oldVoiceChannel.id][0].id).voice.setChannel(newVoiceChannel)
									.catch(() => null);
							}
							// Return bot to queue channel
							newVoiceState.setChannel(oldVoiceChannel)
								.catch(() => null);
						}
					}
					// Person
					else {
						let immediateUpdate = false;
						if (availableVoiceChannels.includes(newVoiceChannel) && !guildMemberDict[guild.id][newVoiceChannel.id].some(
							(queueMember: { id: string; msg: string }) => queueMember.id === member.id)) {
							// User joined channel, add to queue
							guildMemberDict[guild.id][newVoiceChannel.id].push({ id: member.id, msg: null });
							updateDisplayQueue(guild, [newVoiceChannel]);
							immediateUpdate = true;
						}
						if (availableVoiceChannels.includes(oldVoiceChannel)) {
							// User left channel, start removal process
							checkAfterLeaving(member, guild, oldVoiceChannel, immediateUpdate);
						}
					}
				}
			});
		}
	}
});