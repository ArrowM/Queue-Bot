// Setup
const {
	prefix,
	token,
	database_type,
	database_uri,
	database_username,
	database_password,
	grace_period,
	permissions_regexp,
	color,
	queue_cmd,
	start_cmd,
	display_cmd,
	grace_period_cmd,
	help_cmd
} = require('./config.json');

const Discord = require('discord.js');
const client = new Discord.Client();
const Keyv = require('keyv');

const Mutex = require('async-mutex');
const voiceChannelLocks = new Map();	// Map<guild.id, MutexInterface>;
const guildMemberLocks = new Map();		// Map<guild.id, MutexInterface>;
const displayEmbedLocks = new Map();	// Map<guild.id, MutexInterface>;

const sleep = m => new Promise(r => setTimeout(r, m));

const voiceChannelDict = (function () {
	return new Keyv(`${database_type}://${database_username}:${database_password}@${database_uri}`);	// guild.id | grace_period, [voice Channel.id, ...]
})();
const guildMemberDict = [];		// guild.id | voice GuildChannel.id | [guildMember.id, ...]
const displayEmbedDict = [];	// guild.id | voice GuildChannel.id | text GuildChannel.id | [message.id, ...]

client.login(token);
voiceChannelDict.on('error', err => console.error('Keyv connection error:', err));

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once('ready', async () => {
	const storedvoiceChannelDict = await voiceChannelDict.entries();
	for (const guildIdVoiceChannelPair of storedvoiceChannelDict) {
		const guild = client.guilds.cache.get(guildIdVoiceChannelPair[0]);
		// Cleanup deleted Guilds
		if (!guild) {
			await voiceChannelDict.delete(guildIdVoiceChannelPair[0]);
		}
		else {
			// Create locks
			guildMemberLocks.set(guild.id, new Mutex.Mutex());
			displayEmbedLocks.set(guild.id, new Mutex.Mutex());
			voiceChannelLocks.set(guild.id, new Mutex.Mutex());
			// LOCK
			const guildMemberRelease = await guildMemberLocks.get(guild.id).acquire();
			const displayEmbedRelease = await displayEmbedLocks.get(guild.id).acquire();
			const voiceChannelRelease = await voiceChannelLocks.get(guild.id).acquire();
			try {
				const guildDBData = guildIdVoiceChannelPair[1];
				const gracePeriod = guildDBData[0] ? guildDBData[0] : grace_period; // Set grace period to default from config on new servers.
				const voiceChannelIds = guildDBData.slice(1);

				for (const voiceChannelId of voiceChannelIds) {
					const voiceChannel = client.channels.cache.get(voiceChannelId);
					if (voiceChannel) {
						// Initialize member queue
						if (!guildMemberDict[guild.id]) {
							guildMemberDict[guild.id] = [];
						}
						guildMemberDict[guild.id][voiceChannel.id] = voiceChannel.members.filter(member => !member.user.bot).map(member => member.id);
					}
					else {
						// Cleanup deleted Channels
						voiceChannelIds.splice(voiceChannelIds.indexOf(voiceChannel.id), 1);
						voiceChannelIds.unshift(gracePeriod);
						voiceChannelDict.set(guild, voiceChannelIds);
					}
				}
			}
			finally {
				// UNLOCK
				guildMemberRelease();
				displayEmbedRelease();
				voiceChannelRelease();
            }
		}
	}
	client.user.setPresence({ activity: { name: `${prefix}${help_cmd} for help` }, status: 'online' }).then().catch(console.error);
	console.log('Ready!');
});
client.once('reconnecting', async () => {
	if (guildMemberLocks.get(guild.id)) {
		await guildMemberLocks.get(guild.id).runExclusive(async () => { // Lock ensures that update is atomic)
			for (const guildId of Object.keys(guildMemberDict)) {
				const availableVoiceChannels = Object.keys(guildMemberDict[guildId]).map(id => client.channels.cache.get(id));
				for (const voiceChannel of availableVoiceChannels) {
					// Remove users who left during disconnect
					for (let i = 0; i < guildMemberDict[guildId][voiceChannel].length; i++) {
						const memberId = guildMemberDict[guildId][voiceChannel][i];
						if (!voiceChannel.members.includes(memberId)) {
							guildMemberDict[guildId][voiceChannel].splice(i, 1); i--;
						}
					}
					// Add users who joined during disconnect
					for (let i = 0; i < voiceChannel.members.length; i++) {
						const memberId = voiceChannel.members[i].id;
						if (!member.user.bot && !guildMemberDict[guildId][voiceChannel].includes(memberId)) {
							guildMemberDict[guildId][voiceChannel].push(memberId);
						}
					}
				}
			}
		});
	}
	console.log('Reconnecting!');
});
client.once('disconnect', () => {
	console.log('Disconnect!');
});

async function getGracePeriodString(guildId) {
	const gracePeriod = (await voiceChannelDict.get(guildId))[0];
	const grace_minutes = Math.round(gracePeriod / 60);
	const grace_seconds = gracePeriod % 60;
	return (grace_minutes > 0 ? grace_minutes + ' minute' : '') + (grace_minutes > 1 ? 's' : '')
		+ (grace_minutes > 0 && grace_seconds > 0 ? ' and ' : '') + (grace_seconds > 0 ? grace_seconds + ' second' : '') + (grace_seconds > 1 ? 's' : '');
}

// Monitor for users joining voice channels
client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {

	const oldVoiceChannel = oldVoiceState.channel;
	const newVoiceChannel = newVoiceState.channel;
	const member = newVoiceState.member;
	const guild = newVoiceState.guild;

	if (oldVoiceChannel !== newVoiceChannel && guildMemberLocks.get(guild.id)) {
		await guildMemberLocks.get(guild.id).runExclusive(async () => { // Lock ensures that update is atomic

			if (!guildMemberDict[guild.id]) {
				guildMemberDict[guild.id] = []; // Initialize empty queue if necessary
			}
			const availableVoiceChannels = Object.keys(guildMemberDict[guild.id]).map(id => client.channels.cache.get(id));

			if (availableVoiceChannels.includes(newVoiceChannel) || availableVoiceChannels.includes(oldVoiceChannel)) {
				if (member.user.bot) {
					if (newVoiceChannel && !availableVoiceChannels.includes(newVoiceChannel)) {
						if (guildMemberDict[guild.id][oldVoiceChannel.id].length > 0) {
							// Person to swap
							guild.members.cache.get(guildMemberDict[guild.id][oldVoiceChannel.id][0]).voice.setChannel(newVoiceChannel); // If the use queue is not empty, pull in the next in user queue
							guildMemberDict[guild.id][oldVoiceChannel.id].shift();
						}
						newVoiceState.setChannel(oldVoiceChannel); // Return bot to queue channel
					}
				}
				else {
					// console.log(`[${guild.name}] | [${member.displayName}] moved from [${oldVoiceChannel ? oldVoiceChannel.name : null}] to [${newVoiceChannel ? newVoiceChannel.name : null}]`);

					if (availableVoiceChannels.includes(newVoiceChannel) && !guildMemberDict[guild.id][newVoiceChannel.id].includes(member.id)) { // Joining Queue
						guildMemberDict[guild.id][newVoiceChannel.id].push(member.id); // User joined channel, add to queue
						updateDisplayQueue(guild, [oldVoiceChannel, newVoiceChannel]);
					}
					if (availableVoiceChannels.includes(oldVoiceChannel)) {
						checkAfterLeaving(member, guild, oldVoiceChannel, newVoiceChannel);
					}
				}
			}
		});
	}
});

async function checkAfterLeaving(member, guild, oldVoiceChannel, newVoiceChannel) {
	// console.log(`[${guild.name}] | [${member.displayName}] set to leave [${oldVoiceChannel.name}] queue in ${grace_period} seconds`);
	const gracePeriod = (await voiceChannelDict.get(guild.id))[0];
	let timer = 0;
	while (timer < gracePeriod) {
		await sleep(2000);
		if (member.voice.channel === oldVoiceChannel) return;
		timer+=2;
	}
	await guildMemberLocks.get(guild.id).runExclusive(async () => { // Lock ensures that update is atomic
		guildMemberDict[guild.id][oldVoiceChannel.id].splice(guildMemberDict[guild.id][oldVoiceChannel.id].indexOf(member.id), 1); // User left channel, remove from queue
	});
	// console.log(`[${guild.name}] | [${member.displayName}] left [${oldVoiceChannel.name}] queue`);
	updateDisplayQueue(guild, [oldVoiceChannel, newVoiceChannel]);
}

async function hasPermissions(message) { 
	const regex = RegExp(permissions_regexp);
	return message.member.roles.cache.some(role => regex.test(role.name.toLowerCase()) || message.member.id === message.guild.ownerID);
}

async function fetchVoiceChannel(cmd, message) {
	const guild = message.guild;
	let voiceChannel;

	if (guildMemberDict[guild.id]) {
		// Extract channel name from message
		const channelArg = message.content.slice(`${prefix}${cmd}`.length).trim();
		const availableVoiceChannels = Object.keys(guildMemberDict[guild.id]).map(id => client.channels.cache.get(id));

		if (availableVoiceChannels.length === 1 && channelArg === "") {
			voiceChannel = availableVoiceChannels[0];
		}
		else if (channelArg !== "") {
			voiceChannel = availableVoiceChannels.find(channel => channel.name.localeCompare(channelArg, undefined, { sensitivity: 'accent' }) === 0);
		}

		if (voiceChannel) return voiceChannel;

		message.channel.send(`Invalid channel name!`
			+ `\nValid channels: ${availableVoiceChannels.map(voiceChannel => ' `' + voiceChannel.name + '`')}`);
	}
	else {
		message.channel.send(`No queue channels set. Set a queue first using \`${prefix}${queue_cmd} channel name\``
			+ `\nValid channels: ${guild.channels.cache.filter(c => c.type === 'voice').map(channel => ` \`${channel.name}\``)}`);
	}
}

async function start(message) {
	if (!await hasPermissions(message)) return;

	const voiceChannel = await fetchVoiceChannel(start_cmd, message);

	if (voiceChannel) {
		await voiceChannel.join().then(connection => {
			connection.voice.setSelfMute(true);
		});
		console.log("Successfully connected.");
	}
}

async function generateEmbed(voiceChannel) {
	const memberIdQueue = guildMemberDict[voiceChannel.guild.id][voiceChannel.id];
	let embedList = [{
		"embed": {
			"title": `${voiceChannel.name} Queue`,
			"color": color,
			"description": `Join the **${voiceChannel.name}** voice channel to join the waiting queue.`
				+ ` If you leave, you have ${await getGracePeriodString(voiceChannel.guild.id)} to rejoin before being removed from the queue.`,
			"fields": [{
				"name": `Current queue length: **${memberIdQueue.length}**`,
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
						"color": color,
						"fields": []
					}
				});
			}

			// Populate with names and numbers
			const fields = [];
			memberIdQueue.slice(position, sliceStop).map(function (memberId) {
				fields.push({
					"name": ++position,
					"value": voiceChannel.guild.members.cache.get(memberId).displayName
				});
			});
			embedList[i]['embed']['fields'].push(fields);

			sliceStop += maxEmbedSize;
		}
	}
	return embedList;
}

async function displayQueue(message) {
	if (!await hasPermissions(message)) return;
	const guild = message.guild;
	const textChannel = message.channel;
	const voiceChannel = await fetchVoiceChannel(display_cmd, message);

	if (voiceChannel) {
		let embedList = await generateEmbed(voiceChannel);

		if (displayEmbedLocks.get(guild.id)) {
			await displayEmbedLocks.get(guild.id).runExclusive(async () => { // Lock ensures that update is atomic

				// Initialize display message queue
				if (!displayEmbedDict[guild.id]) {
					displayEmbedDict[guild.id] = [];
				}
				if (!displayEmbedDict[guild.id][voiceChannel.id]) {
					displayEmbedDict[guild.id][voiceChannel.id] = [];
				}

				// Remove old display list
				if (displayEmbedDict[guild.id][voiceChannel.id][textChannel.id]) {
					for (const storedEmbed of Object.values(displayEmbedDict[guild.id][voiceChannel.id][textChannel.id])) {
						storedEmbed.delete();
					}
				}

				// Create new display list
				displayEmbedDict[guild.id][voiceChannel.id][textChannel.id] = [];
				embedList.forEach(queueEmbed =>
					textChannel.send(queueEmbed).then(msg =>
						displayEmbedDict[guild.id][voiceChannel.id][textChannel.id].push(msg)
					)
				);
			});
		}
	}
}

async function updateDisplayQueue(guild, voiceChannels) {
	if (displayEmbedDict[guild.id] && displayEmbedLocks.get(guild.id)) {
		await displayEmbedLocks.get(guild.id).runExclusive(async () => { // Lock ensures that update is atomic
			for (const voiceChannel of voiceChannels) {
				if (voiceChannel && displayEmbedDict[guild.id][voiceChannel.id]) {
					const embedList = await generateEmbed(voiceChannel); // This is slow
					for (const textChannelId of Object.keys(displayEmbedDict[guild.id][voiceChannel.id])) {
						const storedEmbeds = Object.values(displayEmbedDict[guild.id][voiceChannel.id][textChannelId]);
						// Same number of embed messages, edit them
						if (storedEmbeds.length === embedList.length) {
							for (var i = 0; i < embedList.length; i++) {
								storedEmbeds[i].edit(embedList[i]);
							}
						}
						// Different number of embed messages, create all new messages
						else {
							let textChannel = storedEmbeds[0].channel;
							// Remove old display list
							for (const storedEmbed of Object.values(storedEmbeds)) {
								storedEmbed.delete();
							}
							displayEmbedDict[guild.id][voiceChannel.id][textChannelId] = [];
							// Create new display list
							embedList.forEach(queueEmbed =>
								textChannel.send(queueEmbed).then(
									msg => displayEmbedDict[guild.id][voiceChannel.id][textChannelId].push(msg)
								)
							);
						}
					}
				}
			}
		});
	}
}

async function setQueueChannel(message) {
	if (!await hasPermissions(message)) return;
	const guild = message.guild;
	const availableVoiceChannels = guild.channels.cache.filter(c => c.type === 'voice');
	if (!voiceChannelLocks.get(guild.id)) {
		voiceChannelLocks.set(guild.id, new Mutex.Mutex());
		guildMemberLocks.set(guild.id, new Mutex.Mutex());
		displayEmbedLocks.set(guild.id, new Mutex.Mutex());
	}
	await voiceChannelLocks.get(guild.id).runExclusive(async () => { // Lock ensures that update is atomic
		// Get stored voice channel list from database
		const guildDBData = await voiceChannelDict.get(guild.id);
		const gracePeriod = (guildDBData && guildDBData[0]) ? guildDBData[0] : grace_period; // Set grace period to default from config on new servers.
		const voiceChannelIds = guildDBData ? guildDBData.slice(1) : [];

		// Extract channel name from message
		const channelArg = message.content.slice(`${prefix}${queue_cmd}`.length).trim();

		// No argument. Display current queues
		if (channelArg === "") {
			if (voiceChannelIds.length > 0) {
				message.channel.send(`Current queues: ${voiceChannelIds.map(id => ` \`${guild.channels.cache.get(id).name}\``)}`);
			} else {
				message.channel.send(`No queue channels set:`
					+ `\n${prefix}${queue_cmd} \`channel name\``
					+ `\nValid channels: ${availableVoiceChannels.map(voiceChannel => ` \`${voiceChannel.name}\``)}`);
			}

		}
		// Channel argument provided. Toggle it
		else {
			const voiceChannel = availableVoiceChannels.find(channel =>
				channel.name.localeCompare(channelArg, undefined, { sensitivity: 'accent' }) === 0);

			if (!voiceChannel) {
				message.channel.send(`Invalid channel name!`
					+ `\nValid channels: ${availableVoiceChannels.map(voiceChannel => ` \`${voiceChannel.name}\``)}`);
			}
			else {
				// Check Perms
				if (!voiceChannel.permissionsFor(message.client.user).has('CONNECT')) {
					return message.channel.send('I need the permissions to join your voice channel!');
				}

				// Initialize member queue
				if (!guildMemberDict[guild.id]) {
					guildMemberDict[guild.id] = [];
				}

				// Toggle Queue
				if (voiceChannelIds.includes(voiceChannel.id)) { // If it's in the list, remove it
					voiceChannelIds.splice(voiceChannelIds.indexOf(voiceChannel.id), 1);
					delete guildMemberDict[guild.id][voiceChannel.id];
					message.channel.send(`Deleted queue for \`${voiceChannel.name}\`.`);
				}
				else { // If it's not in the list, add it
					voiceChannelIds.push(voiceChannel.id);
					guildMemberDict[guild.id][voiceChannel.id] = voiceChannel.members.filter(m => !m.user.bot).map(m => m.id);
					message.channel.send(`Created queue for \`${voiceChannel.name}\`.`);
				}

				// Store channel to database
				voiceChannelIds.unshift(gracePeriod);
				voiceChannelDict.set(guild.id, voiceChannelIds);
			}
		}
	});
}

async function help(message) {
	const embed = {
		"embed": {
			"title": "How to use",
			"color": color,
			"author": {
				"name": "Queue Bot",
				"url": "https://top.gg/bot/679018301543677959",
				"icon_url": "https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/icon.png"
			},
			"fields": [
				{
					"name": "Access",
					"value": "All commands are restricted to owners or users with `mod` or `mods` in their server roles."
				},
				{
					"name": prefix + start_cmd,
					"value": `Create or delete queues using  \`${prefix}${start_cmd} {channel name}\`. Show current queues using \`${prefix}${start_cmd}\`.`
				},
				{
					"name": prefix + display_cmd,
					"value": `Display queues in chat using  \`${prefix}${display_cmd} {channel name}\`. Display messages stay updated.`
				},
				{
					"name": prefix + queue_cmd,
					"value": `Add the bot to a voice channel using  \`${prefix}${queue_cmd} {channel name}\`.`
						+ ` The bot can be pulled into a non- queue channel to automatically swap with person at the front of the queue.`
						+ ` Right-click the bot to disconnect it from the voice channel when done.`
				},
				{
					"name": prefix + grace_period_cmd,
					"value": `Change how long a person can leave a voice channel before being removed using  \`${prefix}${grace_period_cmd} {time in seconds}\`.`
				}
			]
		}
	};
	message.channel.send(embed);
}

async function setGracePeriod(message) {
	if (!await hasPermissions(message)) return;
	const guild = message.guild;
	const newGracePeriod = message.content.slice(`${prefix}${grace_period_cmd}`.length).trim();
	const guildDBData = await voiceChannelDict.get(guild.id);
	if (guildDBData) {
		if (newGracePeriod >= 0 && newGracePeriod <= 600) {
			const voiceChannelIds = guildDBData.slice(1);
			// Store channel to database
			voiceChannelIds.unshift(newGracePeriod);
			voiceChannelDict.set(guild.id, voiceChannelIds);
			updateDisplayQueue(guild, voiceChannelIds.map(id => guild.channels.cache.get(id)));
			message.channel.send(`Grace period set to \`${newGracePeriod}\` seconds.`);
		}
		else {
			message.channel.send(`Invalid grace period!\n`
				+ `Grace period must be between \`0\` and \`600\` seconds.`);
		}
	}
	else {
		message.channel.send(`No queue channels set. Set a queue first using \`${prefix}${queue_cmd} channel name\``
			+ `\nValid channels: ${guild.channels.cache.filter(c => c.type === 'voice').map(channel => ` \`${channel.name}\``)}`);
	}
}

// Monitor for chat commands
client.on('message', async message => {
	if (message.author.bot || !message.content.startsWith(prefix)) return;
	content = message.content.trim();
	// console.log(message.content);

	if (content.startsWith(prefix + start_cmd)) {
		start(message);

	} else if (content.startsWith(prefix + display_cmd)) {
		displayQueue(message);

	} else if (content.startsWith(prefix + queue_cmd)) {
		setQueueChannel(message);

	} else if (content.startsWith(prefix + help_cmd)) {
		help(message);

	} else if (content.startsWith(prefix + grace_period_cmd)) {
		setGracePeriod(message);
	}
});