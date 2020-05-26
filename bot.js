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
const guildVoiceChannelDictId = (function () {
	return new Keyv(`${database_type}://${database_username}:${database_password}@${database_uri}`); // guild.id | voice.channel.id
})();
const guildGuildMemberIdDict = {};	// guild | [guildMember.id, ...]
const guildDisplayMessageDict = {};

client.login(token);
guildVoiceChannelDictId.on('error', err => console.error('Keyv connection error:', err));

// Basic console listeners
client.once('ready', () => {
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
					updateDisplayQueue(guild);
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
				updateDisplayQueue(guild);
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

async function generateEmbed(guild) {
	try {
		const memberIdQueue = guildGuildMemberIdDict[guild.id];
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
						"value": guild.members.cache.get(memberId).displayName
					});
				});
				embedList[i]['embed']['fields'].push(fields);
			}
		}
		// Set name and color
		let channelName = guild.channels.cache.get(await guildVoiceChannelDictId.get(guild.id)).name;
		embedList.forEach(queueEmbed => {
			queueEmbed['embed']['title'] = channelName;
			queueEmbed['embed']['color'] = color;
			queueEmbed['content'] = "Voice Channel Queue";
		});

		return embedList;
	} catch (e) { console.error(e); }
}

async function displayQueue(message) {
	try {
		if (!hasPermissions(message)) return;
		const guild = message.guild;
		const channel = message.channel;

		let embedList = await generateEmbed(guild);

		if (!guildDisplayMessageDict[guild.id]) {
			guildDisplayMessageDict[guild.id] = [];
		}

		// Remove old display list
		for (const storedEmbeds of Object.values(guildDisplayMessageDict[guild.id])) {
			for (const storedEmbed of Object.values(storedEmbeds)) {
				storedEmbed.delete();
			}
		}

		// Create new display list
		guildDisplayMessageDict[guild.id][channel] = [];
		embedList.forEach(queueEmbed =>
			message.channel.send(queueEmbed).then(msg =>
				guildDisplayMessageDict[guild.id][channel].push(msg)
			)
		);
	} catch (e) { console.error(e); }
}

async function updateDisplayQueue(guild) {
	try {
		if (guildDisplayMessageDict[guild.id]) {
			let embedList = await generateEmbed(guild);

			for (const storedEmbeds of Object.values(guildDisplayMessageDict[guild.id])) {
				// Same number of embed messages, edit them
				if (storedEmbeds.length === embedList.length) {
					for (var i = 0; i < embedList.length; i++) {
						storedEmbeds[i].edit(embedList[i]);
					}
				}

				// Different number of embed messages, create all new messages
				else {
					let channel = storedEmbeds[0].channel;
					// Remove old display list
					for (const storedEmbed of Object.values(storedEmbeds)) {
						storedEmbed.delete();
					}
					guildDisplayMessageDict[guild.id][channel] = [];
					// Create new display list
					embedList.forEach(queueEmbed =>
						channel.send(queueEmbed).then(
							msg => guildDisplayMessageDict[guild.id][channel].push(msg)
						)
					);
				}
			}
		}
	} catch (e) { console.error(e); }
}

async function setQueueChannel(message, guildVoiceChannelDictId, guildGuildMemberIdDict) {
	try {
		if (!hasPermissions(message)) return;
		const guild = message.guild;
		const voiceChannelId = await guildVoiceChannelDictId.get(guild.id);
		const channelName = message.content.slice(`${prefix}${start_cmd}`.length).trim(); // Extract channel name from message

		if (channelName === "") { // Display current guild
			if (voiceChannelId) {
				return message.channel.send(`Current queue channel: [${guild.channels.cache.get(voiceChannelId).name}]`);
			} else {
				return message.channel.send(`Queue channel not set yet:\n${prefix}${queue_cmd} {channel name}`);
			}
		} else { // Set current guild
			const availableVoiceChannels = guild.channels.cache.filter(c => c.type === 'voice');
			const voiceChannel = availableVoiceChannels.find(x => x.name.toUpperCase() === channelName.toUpperCase());

			if (!voiceChannel) return message.channel.send(`Invalid channel name!\nValid channels:${availableVoiceChannels.map(a => ` [${a.name}]`)}`);
			const permissions = voiceChannel.permissionsFor(message.client.user);
			if (!permissions.has('CONNECT')) {
				return message.channel.send('I need the permissions to join your voice channel!');
			}

			await guildVoiceChannelDictId.set(guild, voiceChannel.id);
			guildGuildMemberIdDict[guild.id] = voiceChannel.members.filter(m => !m.user.bot).map(m => m.id);
			message.channel.send(`Queue channel set to [${channelName}].`);
			if (!guild.members.cache.get(guildGuildMemberIdDict[guild.id][0])) {
				start(message, guildVoiceChannelDictId);
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

	if (content === `${prefix}${start_cmd}`) {
		start(message, guildVoiceChannelDictId);
	} else if (content === `${prefix}${display_cmd}`) {
		displayQueue(message, guildGuildMemberIdDict);
	} else if (content.startsWith(`${prefix}${queue_cmd}`)) {
		setQueueChannel(message, guildVoiceChannelDictId, guildGuildMemberIdDict);
	} else if (content === `${prefix}${help_cmd}`) {
		help(message);
	}
});