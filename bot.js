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
	help_cmd
} = require('./config.json');

const Discord = require('discord.js');
const client = new Discord.Client();
const Keyv = require('keyv');

const sleep = m => new Promise(r => setTimeout(r, m));

// CMD:	service postgresql start
let guildVoiceChannelDictId = (function () {
	return new Keyv(`${database_type}://${database_username}:${database_password}@${database_uri}`); // guild.id | [voice GuildChannel.id, ...]
})();
const guildGuildMemberIdDict = [];	// guild.id | voice GuildChannel | [guildMember.id, ...]
const guildDisplayMessageDict = []; // guild.id | voice GuildChannel | text channel | [message.id, ...]

client.login(token);
guildVoiceChannelDictId.on('error', err => console.error('Keyv connection error:', err));

// Basic console listeners
client.once('ready', () => {
	console.log(Promise.resolve(guildVoiceChannelDictId.keys()));
	//for (guildId of Object.keys(guildVoiceChannelDictId)) {
	//	for (voiceChannel of Object.keys(guildVoiceChannelDictId[guildId])) {
	//		guildGuildMemberIdDict[guildId] = [];
	//		console.log("v: " + voiceChannel.name);
	//		console.log("m: " + voiceChannel.members.length);
	//		if (voiceChannel.members) {
	//			guildGuildMemberIdDict[guildId][voiceChannel] = voiceChannel.members.map(member => member.id);
	//		}
	//	}
	//}
	//console.log(guildGuildMemberIdDict);
	console.log('Ready!');
});
client.once('reconnecting', () => {
	console.log('Reconnecting!');
});
client.once('disconnect', () => {
	console.log('Disconnect!');
});

// Monitor for users joining voice channels
client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
	try {
		let oldChannel = oldVoiceState.channel;
		let newChannel = newVoiceState.channel;
		let member = newVoiceState.member;
		const guild = newVoiceState.guild;
		const voiceChannelId = await guildVoiceChannelDictId.get(guild.id);

		if (oldChannel !== newChannel && voiceChannelId) {
			if (!guildGuildMemberIdDict[guild.id]) {
				guildGuildMemberIdDict[guild.id] = []; // Initialize empty queue if necessary
			}

			console.log(`[${guild.name}] | [${member.displayName}] moved from [${oldChannel ? oldChannel.name : null}] to [${newChannel ? newChannel.name : null}]`);

			const queueVoiceChannel = guild.channels.cache.get(voiceChannelId);

			if (newChannel === queueVoiceChannel) { // Joining Queue
				if (!member.user.bot && !guildGuildMemberIdDict[guild.id].includes(member.id)) {
					guildGuildMemberIdDict[guild.id].push(member.id); // User joined channel, add to queue
					updateDisplayQueue(guild, guildGuildMemberIdDict);
				}
			} else if (oldChannel === queueVoiceChannel) { // Leaving Queue
				if (member.user.bot) {
					if (newChannel) {
						if (guildGuildMemberIdDict[guild.id].length > 0) { // Bot got pulled into another channel
							guild.members.cache.get(guildGuildMemberIdDict[guild.id][0]).voice.setChannel(newChannel); // If the use queue is not empty, pull in the next in user queue
							guildGuildMemberIdDict[guild.id].shift();
						}
						newVoiceState.setChannel(queueVoiceChannel); // Return bot to queue channel
					}
				} else {
					console.log(`[${guild.name}] | [${member.displayName}] set to leave queue in ${grace_period} seconds`);
					let timer = 0;
					while (timer < grace_period) {
						await sleep(1000);
						if (member.voice.channel === queueVoiceChannel) return;
						timer++;
					}
					guildGuildMemberIdDict[guild.id].splice(guildGuildMemberIdDict[guild.id].indexOf(member.id), 1); // User left channel, remove from queue
				}
				updateDisplayQueue(guild, guildGuildMemberIdDict);
			}
		}
	} catch (e) { console.error(e); }
});

function hasPermissions(message) { 
	const regex = RegExp(permissions_regexp);
	return message.member.roles.cache.some(role => regex.test(role.name.toLowerCase()) || message.member.id === message.guild.ownerID);
}

async function start(message, guildVoiceChannelDictId) {
	try {
		if (!hasPermissions(message)) return;
		const guild = message.guild;
		const queueVoiceChannel = guild.channels.cache.get(await guildVoiceChannelDictId.get(guild.id));

		if (!queueVoiceChannel) {
			message.channel.send(`Queue channel not set yet:\n${prefix}${queue_cmd} {channel name}`);
		} else {
			await queueVoiceChannel.join().then(connection => {
				connection.voice.setSelfMute(true);
			});
			console.log("Successfully connected.");
		}
	} catch (e) { console.error(e); }
}

async function generateEmbed(voiceChannel, guildGuildMemberIdDict) {
	try {
		console.log(voiceChannel);
		const memberIdQueue = guildGuildMemberIdDict[voiceChannel.guild.id][voiceChannel];
		let embedList = [];
		// Handle empty queue
		if (!memberIdQueue || memberIdQueue.length === 0) {
			embedList = [{
				"embed": {
					"fields": {
						"name": "Empty",
						"value": "Empty"
					}
				}
			}];
		}
		// Handle non-empty
		else {
			const maxEmbedSize = 25;
			let position = 0;
			for (var i = 0; i < memberIdQueue.length / maxEmbedSize; i++) {
				embedList.push({
					"embed": {
						"fields": []
					}
				});

				let fields = [];
				memberIdQueue.slice(i * maxEmbedSize, (i + 1) * maxEmbedSize).map(function (memberId) {
					fields.push({
						"name": ++position,
						"value": voiceChannel.guild.members.cache.get(memberId).displayName
					});
				});
				embedList[i]['embed']['fields'].push(fields);
			}
		}
		// Set name and color
		let channelName = voiceChannel.name;
		embedList.forEach(queueEmbed => {
			queueEmbed['embed']['title'] = channelName;
			queueEmbed['embed']['color'] = color;
			queueEmbed['content'] = "Voice Channel Queue";
		});

		return embedList;
	} catch (e) { console.error(e); }
}

async function displayQueue(message, guildGuildMemberIdDict, guildDisplayMessageDict) {
	try {
		if (!hasPermissions(message)) return;
		const guild = message.guild;
		const textChannel = message.channel;

		// Extract channel name from message
		const channelArg = message.content.slice(`${prefix}${start_cmd}`.length).trim();
		if (channelArg === "") { // Display current queues
			textChannel.send(`Must include channel name!`
				+ `\nValid channels: ${Object.keys(guildDisplayMessageDict).map(voiceChannel => ` \`${voiceChannel.name}\``)}`);
		}
		else {
			const voiceChannel = Object.keys(guildDisplayMessageDict).find(channel =>
				channel.name.localeCompare(channelArg, undefined, { sensitivity: 'accent' }) === 0);
			if (!voiceChannel) {
				message.channel.send(`Invalid channel name!`
					+ `\nValid channels: ${Object.keys(guildDisplayMessageDict).map(voiceChannel => ` \`${voiceChannel.name}\``)}`);
			}
			else {
				console.log(1);
				let embedList = await generateEmbed(voiceChannel, guildGuildMemberIdDict);

				// Initialize display message queue
				if (!guildDisplayMessageDict[guild.id]) {
					guildDisplayMessageDict[guild.id] = [];
				}
				if (!guildDisplayMessageDict[guild.id][voiceChannel]) {
					guildDisplayMessageDict[guild.id][voiceChannel] = [];
				}

				// Remove old display list
				if (guildDisplayMessageDict[guild.id][voiceChannel][textChannel]) {
					for (const storedEmbed of Object.values(guildDisplayMessageDict[guild.id][voiceChannel][textChannel])) {
						storedEmbed.delete();
					}
				}

				// Create new display list
				guildDisplayMessageDict[guild.id][voiceChannel][textChannel] = [];
				embedList.forEach(queueEmbed =>
					textChannel.send(queueEmbed).then(msg =>
						guildDisplayMessageDict[guild.id][voiceChannel][textChannel].push(msg)
					)
				);

				console.log(2);
			}
		}
	} catch (e) { console.error(e); }
}

async function updateDisplayQueue(guild, guildGuildMemberIdDict) {
	try {
		if (guildDisplayMessageDict[guild.id]) {
			for (const voiceChannel of Object.keys(guildDisplayMessageDict[guild.id])) {
				let embedList = await generateEmbed(voiceChannel, guildGuildMemberIdDict);
				for (const storedEmbeds of guildDisplayMessageDict[guild.id][voiceChannel]) {
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
						guildDisplayMessageDict[guild.id][voiceChannel][textChannel] = [];
						// Create new display list
						embedList.forEach(queueEmbed =>
							textChannel.send(queueEmbed).then(
								msg => guildDisplayMessageDict[guild.id][voiceChannel][channel].push(msg)
							)
						);
					}
				}
			}
		}
	} catch (e) { console.error(e); }
}

async function setQueueChannel(message, guildVoiceChannelDictId, guildGuildMemberIdDict) {
	try {
		if (!hasPermissions(message)) return;
		const guild = message.guild;
		const availableVoiceChannels = guild.channels.cache.filter(c => c.type === 'voice');

		// Get stored voice channel list from database
		const voiceChannelsString = await guildVoiceChannelDictId.get(guild.id);
		const voiceChannelIds = voiceChannelsString ? voiceChannelsString.split(",") : [];

		// Extract channel name from message
		const channelArg = message.content.slice(`${prefix}${start_cmd}`.length).trim();

		if (channelArg === "") { // Display current queues
			if (voiceChannelIds.length > 0) {
				message.channel.send(`Current queues: ${voiceChannelIds.map(id => ` \`${guild.channels.cache.get(id).name}\``)}`);
			} else {
				message.channel.send(`No queue channels set:`
					+ `\n${prefix}${queue_cmd} \`channel name\``
					+ `\nValid channels: ${availableVoiceChannels.map(voiceChannel => ` \`${voiceChannel.name}\``)}`);
			}

		}
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
				if (!guildGuildMemberIdDict[guild.id]) {
					guildGuildMemberIdDict[guild.id] = [];
				}
				guildGuildMemberIdDict[guild.id][voiceChannel] = [];

				// Toggle Queue
				if (voiceChannelIds.includes(voiceChannel.id)) { // If it's in the list, remove it
					voiceChannelIds.splice(voiceChannelIds.indexOf(voiceChannel.id), 1);
					message.channel.send(`Deleted queue for \`${voiceChannel.name}\`.`);
				}
				else { // If it's not in the list, add it
					voiceChannelIds.push(voiceChannel.id);
					message.channel.send(`Created queue for \`${voiceChannel.name}\`.`);
					guildGuildMemberIdDict[guild.id][voiceChannel].concat(voiceChannel.members.filter(m => !m.user.bot).map(m => m.id));
				}

				// Store channel to database
				guildVoiceChannelDictId.set(guild.id, voiceChannelIds.toString());
			}
		}
	} catch (e) { console.error(e); }
}

async function help(message) {
	message.channel.send(`**How to use:**`
		+ `\n1. Setup using ${prefix}${queue_cmd}, then ${prefix}${start_cmd} as explained below.`
		+ `\n2. When you want to pull in the next user (whoever has been in queue the longest), pull the bot into your channel and it will automatically swap with them.`
		+ `\n3. When you are done, right-click the bot, and Disconnect it.`);
	return message.channel.send(`**Commands:**`
		+ `\n${prefix}${queue_cmd} {channel name}\t | Set the queue channel (do this before ${prefix}${start_cmd}).`
		+ `\n${prefix}${start_cmd}\t\t\t\t\t\t\t\t\t | Start the Queue Bot.`
		+ `\n${prefix}${display_cmd}\t\t\t\t\t\t\t\t\t | Display the current waiting queue.`);
}

// Monitor for chat commands
client.on('message', async message => {
	if (message.author.bot || !message.content.startsWith(prefix)) return;
	content = message.content.trim();
	console.log(message.content);

	if (content.startsWith(prefix + start_cmd)) {
		start(message, guildVoiceChannelDictId);

	} else if (content.startsWith(prefix + display_cmd)) {
		displayQueue(message, guildGuildMemberIdDict, guildDisplayMessageDict);

	} else if (content.startsWith(prefix + queue_cmd)) {
		setQueueChannel(message, guildVoiceChannelDictId, guildGuildMemberIdDict);

	} else if (content.startsWith(prefix + help_cmd)) {
		help(message);
	}
});