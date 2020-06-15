// Read Config file
const {
	token,

	color,
	database_type,
	database_uri,
	database_username,
	database_password,
	grace_period,
	permissions_regexp,
	prefix,

	color_cmd,
	command_prefix_cmd,
	display_cmd,
	grace_period_cmd,
	help_cmd,
	join_cmd,
	// kick_cmd,
	queue_cmd,
	start_cmd
} = require('./config.json');

// Setup client
const { Client } = require('discord.js');
const client = new Client({ ws: { intents: ['GUILDS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES'] } });

// Default DB Settings
const defaultDBData = [grace_period, prefix, color, "", "", "", "", "", "", ""];
const ServerSettings = {
	grace_period_cmd: { index: 0, str: "grace period" },
	command_prefix_cmd: { index: 1, str: "command prefix" },
	color_cmd: { index: 2, str: "color"},
	// kick_cmd: { index: 3, str: "kick" }
};
Object.freeze(ServerSettings);

// Keyv long term DB storage
const Keyv = require('keyv');
const channelDict = (function () {
	return new Keyv(`${database_type}://${database_username}:${database_password}@${database_uri}`);	// guild.id | grace_period, [voice Channel.id, ...]
})();
channelDict.on('error', err => console.error('Keyv connection error:', err));

// Short term storage
const guildMemberDict = [];		// guild.id | voice GuildChannel.id | [guildMember.id, ...]
const displayEmbedDict = [];	// guild.id | voice GuildChannel.id | text GuildChannel.id | [message.id, ...]

// Storage Mutexes
const Mutex = require('async-mutex');
const channelLocks = new Map();	// Map<guild.id, MutexInterface>;
const guildMemberLocks = new Map();		// Map<guild.id, MutexInterface>;
const displayEmbedLocks = new Map();	// Map<guild.id, MutexInterface>;

const sleep = m => new Promise(r => setTimeout(r, m));

async function setupLocks(guildId) {
	channelLocks.set(guildId, new Mutex.Mutex());
	guildMemberLocks.set(guildId, new Mutex.Mutex());
	displayEmbedLocks.set(guildId, new Mutex.Mutex());
}

client.login(token);
// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once('ready', async () => {
	const storedchannelDict = await channelDict.entries();
	for (const guildIdChannelPair of storedchannelDict) {
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
			const displayEmbedRelease = await displayEmbedLocks.get(guild.id).acquire();
			const channelRelease = await channelLocks.get(guild.id).acquire();
			try {
				const dbData = guildIdChannelPair[1];
				const otherData = dbData.slice(0, 10);
				const channelIds = dbData.slice(10);
				// Set unset values to default
				for (let i = 0; i < otherData.length; i++) {
					otherData[i] = otherData[i] || defaultDBData[i];
				}
				// Initialize member queue
				guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];
				for (const channelId of channelIds) {
					const channel = client.channels.cache.get(channelId);
					if (channel) {
						// Add people already in a voice channel queue
						guildMemberDict[guild.id][channel.id] = (channel.type === 'voice') ?
							channel.members.filter(member => !member.user.bot).map(member => member.id) : [];
					}
					else {
						// Cleanup deleted Channels
						channelIds.splice(channelIds.indexOf(channelId), 1);
					}
				}
				await channelDict.set(guild.id, otherData.concat(channelIds));
			}
			finally {
				// UNLOCK
				guildMemberRelease();
				displayEmbedRelease();
				channelRelease();
			}
		}
	}
	client.user.setPresence({ activity: { name: `${prefix}${help_cmd} for help` }, status: 'online' }).then().catch(console.error);
	console.log('Ready!');
});
client.on('shardReconnecting', async () => {
	for (const guildId of Object.keys(guildMemberDict)) {
		await guildMemberLocks.get(guild.id).runExclusive(async () => {
			const availableVoiceChannels = Object.keys(guildMemberDict[guildId]).map(id => client.channels.cache.get(id));
			for (const channel of availableVoiceChannels) {
				// Remove users who left during disconnect
				for (let i = 0; i < guildMemberDict[guildId][channel].length; i++) {
					const memberId = guildMemberDict[guildId][channel][i];
					if (!channel.members.includes(memberId)) {
						guildMemberDict[guildId][channel].splice(i, 1); i--;
					}
				}
				// Add users who joined during disconnect
				for (let i = 0; i < channel.members.length; i++) {
					const memberId = channel.members[i].id;
					if (!member.user.bot && !guildMemberDict[guildId][channel].includes(memberId)) {
						guildMemberDict[guildId][channel].push(memberId);
					}
				}
			}
		});
	}
	client.user.setPresence({ activity: { name: `${prefix}${help_cmd} for help` }, status: 'online' }).then().catch(console.error);
	console.log('Reconnecting!');
});
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});

// Monitor for users joining voice channels
client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
	const oldVoiceChannel = oldVoiceState.channel;
	const newVoiceChannel = newVoiceState.channel;
	const member = newVoiceState.member;
	const guild = newVoiceState.guild;

	if (oldVoiceChannel !== newVoiceChannel) {
		await guildMemberLocks.get(guild.id).runExclusive(async () => {

			// Initialize empty queue if necessary
			guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];
			
			const availableVoiceChannels = Object.keys(guildMemberDict[guild.id]).map(id => client.channels.cache.get(id));

			if (availableVoiceChannels.includes(newVoiceChannel) || availableVoiceChannels.includes(oldVoiceChannel)) {
				if (member.user.bot) {
					if (newVoiceChannel && !availableVoiceChannels.includes(newVoiceChannel)) {
						if (guildMemberDict[guild.id][oldVoiceChannel.id].length > 0) {
							// If the use queue is not empty, pull in the next in user queue
							guild.members.cache.get(guildMemberDict[guild.id][oldVoiceChannel.id][0]).voice.setChannel(newVoiceChannel); 
							guildMemberDict[guild.id][oldVoiceChannel.id].shift();
						}
						// Return bot to queue channel
						newVoiceState.setChannel(oldVoiceChannel); 
					}
				}
				else {
					if (availableVoiceChannels.includes(newVoiceChannel) && !guildMemberDict[guild.id][newVoiceChannel.id].includes(member.id)) {
						// User joined channel, add to queue
						guildMemberDict[guild.id][newVoiceChannel.id].push(member.id); 
						updateDisplayQueue(guild, [oldVoiceChannel, newVoiceChannel]);
					}
					if (availableVoiceChannels.includes(oldVoiceChannel)) {
						// User left channel, start removal process
						checkAfterLeaving(member, guild, oldVoiceChannel);
					}
				}
			}
		});
	}
});

/**
 * Watch a user after they leave queue. Remove them once the grace period is reached
 *
 * @param {GuildMember} member Member to watch
 * @param {Guild} guild Guild containing queue
 * @param {VoiceChannel} oldVoiceChannel Queue channel being left 
 */
async function checkAfterLeaving(member, guild, oldVoiceChannel) {
	// console.log(`[${guild.name}] | [${member.displayName}] set to leave [${oldVoiceChannel.name}] queue in ${grace_period} seconds`);
	const gracePeriod = (await channelDict.get(guild.id))[0];
	let timer = 0;
	// Check every 2 seconds
	while (timer < gracePeriod) {
		await sleep(2000);
		if (member.voice.channel === oldVoiceChannel) return;
		timer += 2;
	}

	await guildMemberLocks.get(guild.id).runExclusive(async () => {
		guildMemberDict[guild.id][oldVoiceChannel.id].splice(guildMemberDict[guild.id][oldVoiceChannel.id].indexOf(member.id), 1); // User left channel, remove from queue
	});
	// console.log(`[${guild.name}] | [${member.displayName}] left [${oldVoiceChannel.name}] queue`);
	updateDisplayQueue(guild, [oldVoiceChannel]);
}

async function findChannel(availableChannels, parsed, message) {
	const parameter = parsed.parameter;
	let channel = availableChannels.find(channel => channel.name === parameter) ||
		availableChannels.find(channel => channel.name.localeCompare(parameter, undefined, { sensitivity: 'accent' }) === 0);
	if (channel) return channel;
	message.channel.send(`Invalid channel name! Try \`${parsed.prefix}${parsed.command} {queue name}\`.`
		+ `\nQueues: ${availableChannels.map(channel => ' `' + channel.name + '`')}`
	);
}

/**
 * Get a channel using user argument
 *
 * @param {Object} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 * @return {GuildChannel} Matched channel.
 */
async function fetchChannel(dbData, parsed, message) {
	const channelIds = dbData.slice(10);
	const prefix = parsed.prefix;
	const parameter = parsed.parameter;
	const guild = message.guild;
	let channel;

	if (guildMemberDict[guild.id] && channelIds.length > 0) {
		// Extract channel name from message
		const availableChannels = channelIds.map(id => client.channels.cache.get(id));
		
		if (availableChannels.length === 1 && parameter === "") {
			channel = availableChannels[0];
		}
		else {
			channel = await findChannel(availableChannels, parsed, message);
		}
		return channel;
	} else {
		message.channel.send(`No queue channels set.`
			+ `\nSet a queue first using \`${prefix}${queue_cmd} {channel name}\``
		//	+ `\nChannels: ${guild.channels.cache.filter(c => c.type !== 'category').map(channel => ` \`${channel.name}\``)}`
		);
	}
}

/**
 * Add bot to a voice channel for swapping
 *
 * @param {Object} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function start(dbData, parsed, message) {
	const channel = await fetchChannel(dbData, parsed, message);
	if (channel) {
		if (!channel.permissionsFor(message.client.user).has('CONNECT')) {
			return message.channel.send('I need the permissions to join your voice channel!');
		}
		if (channel.type === 'voice') {
			await channel.join().then(connection => {
				connection.voice.setSelfMute(true);
			});
			// console.log("Successfully connected.");
		} else {
			message.channel.send("I can only join voice channels.")
		}
    }
}

/**
 * Return a grace period in string form
 *
 * @param {number} guildId Guild id.
 * @return {string} Grace period string.
 */
async function getGracePeriodString(guildId) {
	const gracePeriod = (await channelDict.get(guildId))[0];
	const grace_minutes = Math.round(gracePeriod / 60);
	const grace_seconds = gracePeriod % 60;
	return (grace_minutes > 0 ? grace_minutes + ' minute' : '') + (grace_minutes > 1 ? 's' : '')
		+ (grace_minutes > 0 && grace_seconds > 0 ? ' and ' : '') + (grace_seconds > 0 ? grace_seconds + ' second' : '') + (grace_seconds > 1 ? 's' : '');
}

/**
 * Create an Embed to represent everyone in a singl queue. Will create multiple embeds for large queues
 *
 * @param {Object[]} dbData Array of server settings stored in DB.
 * @param {VoiceChannel} channel Discord message object.
 * @return {Embed[]} Array of display embeds
 */
async function generateEmbed(dbData, channel) {
	const prefix = dbData[1];
	const storedColor = dbData[2];
	const memberIdQueue = guildMemberDict[channel.guild.id][channel.id];
	let embedList = [{
		"embed": {
			"title": `${channel.name} Queue`,
			"color": storedColor,
			"description":
				channel.type === 'voice' ? 
					// Voice
					`Join the **${channel.name}** voice channel to join this queue.`
					+ ` If you leave, you have ${await getGracePeriodString(channel.guild.id)} to rejoin before being removed from the queue.` :
					// Text
					`Type \`${prefix}${join_cmd} ${channel.name}\` to join or leave this queue.`,
			"fields": [{
				"name": `Current queue length: **${memberIdQueue.length || 0}**`,
				"value": "\u200b"
			}]
		}
	}];
	// Handle empty queue
	if (!memberIdQueue || memberIdQueue.length === 0) {
		embedList[0]['embed']['fields'][0]['value'] = 'No members in queue.';
	}
	// Handle non-empty
	else {
		const maxEmbedSize = 25;
		let position = 0;					// 0 , 24, 49, 74
		let sliceStop = maxEmbedSize - 1;	// 24, 49, 74, 99 
		for (var i = 0; i <= memberIdQueue.length / maxEmbedSize; i++) {
			if (i > 0) { // Creating additional embed after the first embed
				embedList.push({
					"embed": {
						"color": storedColor,
						"fields": []
					}
				});
			}

			// Populate with names and numbers
			const fields = [];
			memberIdQueue.slice(position, sliceStop).map(function (memberId) {
				fields.push({
					"name": ++position,
					"value": channel.guild.members.cache.get(memberId).displayName
				});
			});
			embedList[i]['embed']['fields'].push(fields);

			sliceStop += maxEmbedSize;
		}
	}
	return embedList;
}

/**
 * Create an embed message to display a channel's queue
 *
 * @param {Object[]} dbData Array of server settings stored in DB.
 * @param {Object} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function displayQueue(dbData, parsed, message) {
	const guild = message.guild;
	const textChannel = message.channel;
	const channel = await fetchChannel(dbData, parsed, message);
	if (channel) {
		let embedList = await generateEmbed(dbData, channel);
		await displayEmbedLocks.get(guild.id).runExclusive(async () => {

			// Initialize display message queue
			displayEmbedDict[guild.id] = displayEmbedDict[guild.id] || [];
			displayEmbedDict[guild.id][channel.id] = displayEmbedDict[guild.id][channel.id] || [];

			// Remove old display list
			if (displayEmbedDict[guild.id][channel.id][textChannel.id]) {
				for (const storedEmbed of Object.values(displayEmbedDict[guild.id][channel.id][textChannel.id])) {
					await storedEmbed.delete().catch(() => { });
				}
			}

			// Create new display list
			displayEmbedDict[guild.id][channel.id][textChannel.id] = [];
			embedList.forEach(queueEmbed =>
				textChannel.send(queueEmbed).then(msg =>
					displayEmbedDict[guild.id][channel.id][textChannel.id].push(msg)
				)
			);
		});
	}
}

/**
 * Update a server's display messages
 *
 * @param {Guild} guild Guild containing display messages
 * @param {VoiceChannel[]} channels Channels to update
 */
async function updateDisplayQueue(guild, channels) {
	const currentChannelIds = guild.channels.cache.map(c => c.id);
	const dbData = await channelDict.get(guild.id);

	if (displayEmbedDict[guild.id]) {
		await displayEmbedLocks.get(guild.id).runExclusive(async () => {

			for (const channel of channels) {
				if (channel && displayEmbedDict[guild.id][channel.id]) {

					if (!currentChannelIds.includes(channel.id)) { // Handled delete channels
						delete displayEmbedDict[guild.id][channel.id];
						continue;
					}

					const embedList = await generateEmbed(dbData, channel); 
					for (const textChannelId of Object.keys(displayEmbedDict[guild.id][channel.id])) {

						if (!currentChannelIds.includes(textChannelId)) { // Handled delete channels
							delete displayEmbedDict[guild.id][channel.id][textChannelId];
							continue;
						}

						const storedEmbeds = Object.values(displayEmbedDict[guild.id][channel.id][textChannelId]);
						// Same number of embed messages, edit them
						if (storedEmbeds.length === embedList.length) {
							for (var i = 0; i < embedList.length; i++) {
								storedEmbeds[i].edit(embedList[i]);
							}
						}
						// Different number of embed messages, create all new messages
						else {
							// Remove old display list
							for (const storedEmbed of Object.values(storedEmbeds)) {
								await storedEmbed.delete().catch(() => { });
							}
							displayEmbedDict[guild.id][channel.id][textChannelId] = [];
							// Create new display list
							let textChannel = storedEmbeds[0].channel;
							embedList.forEach(queueEmbed =>
								textChannel.send(queueEmbed).then(
									msg => displayEmbedDict[guild.id][channel.id][textChannelId].push(msg)
								)
							);
						}
					}
				}
			}
		});
	}
}

/**
 * Toggle a channel's queue status. Display existing queues if no argument is provided.
 *
 * @param {Object[]} dbData Array of server settings stored in DB.
 * @param {Object} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function setQueueChannel(dbData, parsed, message) {
	// Setup common variables
	const prefix = parsed.prefix;
	const parameter = parsed.parameter;
	const guild = message.guild;
	const channels = guild.channels.cache.filter(c => c.type !== 'category');
	// Get stored voice channel list from database
	const otherData = dbData.slice(0, 10);
	const channelIds = dbData.slice(10);

	// No argument. Display current queues
	if (parameter === "") {
		if (channelIds.length > 0) {
			message.channel.send(`Current queues: ${channelIds.map(id => ` \`${guild.channels.cache.get(id).name}\``)}`);
		} else {
			message.channel.send(`No queue channels set.`
				+ `\nSet a new queue channel using \`${prefix}${queue_cmd} {channel name}\``
			//	+ `\nChannels: ${channels.map(channel => ` \`${channel.name}\``)}`
			);
		}
	}
	// Channel argument provided. Toggle it
	else {
		const channel = await findChannel(channels, parsed, message);
		if (channel) {
			// Initialize member queue
			guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];
			// Toggle Queue
			if (channelIds.includes(channel.id)) { // If it's in the list, remove it
				channelIds.splice(channelIds.indexOf(channel.id), 1);
				delete guildMemberDict[guild.id][channel.id];
				// Remove old display list
				try {
					for (const storedEmbed of Object.values(displayEmbedDict[guild.id][channel.id][message.channel.id])) {
						await storedEmbed.delete().catch(() => { });
					}
				} catch { /* try/catch used in place of optional chaining */ }
				message.channel.send(`Deleted queue for \`${channel.name}\`.`);
			}
			else { // If it's not in the list, add it
				channelIds.push(channel.id);
				if (channel.type === 'voice') {
					guildMemberDict[guild.id][channel.id] = channel.members.filter(m => !m.user.bot).map(m => m.id);
				}
				message.channel.send(`Created queue for \`${channel.name}\`.`);
			}
			// Store channel to database
			await channelDict.set(guild.id, otherData.concat(channelIds));
		}
	}
}

/**
 * Add a member into a text queue
 *
 * @param {Object[]} dbData Array of server settings stored in DB.
 * @param {Object} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function joinTextChannel(dbData, parsed, message) {
	const guild = message.guild;
	const channel = await fetchChannel(dbData, parsed, message);
	if (channel) {
		await guildMemberLocks.get(guild.id).runExclusive(async () => {

			if (channel.type === 'text') {
				// Initialize member queue
				guildMemberDict[guild.id][channel.id] = guildMemberDict[guild.id][channel.id] || [];

				if (guildMemberDict[guild.id][channel.id].includes(message.member.id)) {
					// Remove from queue
					guildMemberDict[guild.id][channel.id].splice(guildMemberDict[guild.id][channel.id].indexOf(message.member.id), 1);
					message.channel.send(`Removed \`${message.member.displayName}\` from the \`${channel.name}\` queue.`)
				} else {
					// Add to queue
					guildMemberDict[guild.id][channel.id].push(message.member.id);
					message.channel.send(`Added \`${message.member.displayName}\` to the \`${channel.name}\` queue.`)
				}
				updateDisplayQueue(guild, [channel]);
			} else {
				message.channel.send(`\`${parsed.prefix}${join_cmd}\` can only be used to join text channel Queues.`
					+ ` Join the \`${channel.name}\` voice channel to be added to its queue.`)
            }
		});
	}
}

/**
 * Send message sender a help embed
 *
 * @param {Object[]} dbData Array of server settings stored in DB.
 * @param {Object} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 */
async function help(dbData, parsed, message) {
	const storedPrefix = parsed.prefix;
	const storedColor = dbData[2];
	message.author.send({
		"embed": {
			"title": "Non-Restricted Commands",
			"color": storedColor,
			"author": {
				"name": "Queue Bot",
				"url": "https://top.gg/bot/679018301543677959",
				"icon_url": "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/icon.png"
			},
			"fields": [
				{
					"name": "Access",
					"value": "Available to everyone."
				},
				{
					"name": "Join a Text Channel Queue",
					"value": `\`${storedPrefix}${join_cmd} {channel name}\` joins or leaves a text channel queue.`
				}
			]
		}
	});
	message.author.send({
		"embed": {
			"title": "Restricted Commands",
			"color": storedColor,
			"fields": [
				{
					"name": "Access",
					"value": "Available to owners or users with `mod` or `mods` in their server roles."
				},
				{
					"name": "Modify & View Queues",
					"value": `\`${storedPrefix}${queue_cmd} {channel name}\` creates a new queue or deletes an existing queue.`
						+ `\n\`${storedPrefix}${queue_cmd}\` shows the existing queues.`
				},
				{
					"name": "Display Queue Members",
					"value": `\`${storedPrefix}${display_cmd} {channel name}\` displays the members in a queue. These messages stay updated.`
				},
				{
					"name": "Pull Users from Queue",
					"value": `\`${storedPrefix}${start_cmd} {channel name}\` adds the bot to a queue voice channel.`
						+ ` The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue.`
						+ ` Right-click the bot to disconnect it from the voice channel when done. See the example gif below.`
				},
				{
					"name": "Change the Grace Period",
					"value": `\`${storedPrefix}${grace_period_cmd} {time in seconds}\` changes how long a person can leave a queue before being removed.`
				},
				{
					"name": "Change the Command Prefix",
					"value": `\`${storedPrefix}${command_prefix_cmd} {new prefix}\` changes the prefix for commands.`
				},
				{
					"name": "Change the Color",
					"value": `\`${storedPrefix}${color_cmd} {new color}\` changes the color of bot messages.`
				}
			],
			"image": {
				"url": "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/example.gif"
			},
		}
	});
	message.channel.send("I have sent help to your PMs.");
}

/**
 * Change a server setting
 *
 * @param {Object[]} dbData Array of server settings stored in DB.
 * @param {Object} parsed Parsed message - prefix, command, argument.
 * @param {Message} message Discord message object.
 * @param {boolean} updateDisplayMsgs Whether to update existing display messages.
 * @param {function} valueRestrictions Test to determine whether the user input is valid.
 * @param {string} extraErrorLine Extra hint to display if the user gives invalid input.
 * @param {MessageEmbed} embed Embed to display with extra error line.
 */
async function setServerSettings(dbData, parsed, message, updateDisplayMsgs, valueRestrictions, extraErrorLine, embed) {
	// Setup common variables
	const setting = ServerSettings[parsed.command];
	const guild = message.guild;
	const channelIds = dbData.slice(10);
	
	if (parsed.parameter && valueRestrictions(parsed.parameter)) {
		dbData[setting.index] = parsed.parameter;
		// Store channel to database
		await channelDict.set(guild.id, dbData);
		if (updateDisplayMsgs) updateDisplayQueue(guild, channelIds.map(id => guild.channels.cache.get(id)));
		message.channel.send(`Set ${setting.str} to \`${parsed.parameter}\`.`);
	}
	else {
		message.channel.send({
			"embed": embed,
			"content":
				`The ${setting.str} is currently set to \`${otherData[setting.index]}\`.\n`
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
async function hasPermissions(message) {
	const regex = RegExp(permissions_regexp, 'i');
	return message.member.roles.cache.some(role => regex.test(role.name)) || message.member.id === message.guild.ownerID;
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
		const parsed = {
			"prefix": dbData[1]
		};
		if (message.content.startsWith(parsed.prefix)) {
			// Parse the message
			// Note: Prefix can contain spaces. Command can not contains spaces. Parameter can contain spaces.
			parsed.command = message.content.substring(parsed.prefix.length).split(" ")[0];
			parsed.parameter = message.content.substring(parsed.prefix.length + parsed.command.length + 1);
			// Restricted commands
			if (await hasPermissions(message)) {
				switch (parsed.command) {
					// Start
					case start_cmd:
						start(dbData, parsed, message);
						break;
					// Display
					case display_cmd:
						displayQueue(dbData, parsed, message);
						break;
					// Set Queue
					case queue_cmd:
						await setQueueChannel(dbData, parsed, message);
						break;
					// Grace period
					case grace_period_cmd:
						await setServerSettings(dbData, parsed, message,
							true,
							function (time) { return time >= 0 && time <= 600 },
							'Grace period must be between `0` and `600` seconds.',
							null
						);
						break;
					// Command Prefix
					case command_prefix_cmd:
						setServerSettings(dbData, parsed, message,
							false,
							function () { return true },
							'',
							null
						);
						break;
					// Color
					case color_cmd:
						await setServerSettings(dbData, parsed, message,
							true,
							function (color) { return /^#[0-9A-F]{6}$/i.test(color) },
							'Use HEX color:',
							{ "title": "Hex color picker", "url": "https://htmlcolorcodes.com/color-picker/", "color": dbData[2] }
						);
						break;
				}
			}
			// Commands open to everyone
			switch (parsed.command) {
				// Help
				case help_cmd:
					help(dbData, parsed, message);
					break;
				// Join Text Queue
				case join_cmd:
					await joinTextChannel(dbData, parsed, message);
					break;
			}
		}
		// Default help command
		else if (message.content === prefix + help_cmd) {
			help(dbData, parsed, message);
		}
	});
});