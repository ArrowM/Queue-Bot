// Setup
const {
	prefix,
	token,
	database_type,
	database_uri,
	database_username,
	database_password,
	grace_period
} = require('./config.json');

const QUEUE_CMD = `q`;
const START_CMD = `s`;
const DISPLAY_CMD = `d`;
const HELP_CMD = `help`;

const Discord = require('discord.js');
const client = new Discord.Client();
const Keyv = require('keyv');

// CMD:	service postgresql start
const guildIdVoiceChannelDictId = (function () {
	return new Keyv(`${database_type}://${database_username}:${database_password}@${database_uri}`); // guild.id | voice.channel.id
})();
const guildIdGuildMemberIdDict = {};	// guild.id | [guildMember.id, ...]

client.login(token);
guildIdVoiceChannelDictId.on('error', err => console.error('Keyv connection error:', err));

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
		const voiceChannelId = await guildIdVoiceChannelDictId.get(guild.id);

		if (oldChannel !== newChannel && voiceChannelId) {
			if (!guildIdGuildMemberIdDict[guild.id]) {
				guildIdGuildMemberIdDict[guild.id] = []; // Initialize empty queue if necessary.
			}

			console.log(`[${guild.name}] | [${member.displayName}] moved from [${oldChannel ? oldChannel.name : null}] to [${newChannel ? newChannel.name : null}]`);

			const queueVoiceChannel = guild.channels.cache.get(voiceChannelId);

			if (newChannel === queueVoiceChannel) { // Joining Queue
				if (!member.user.bot) {
					guildIdGuildMemberIdDict[guild.id].push(member.id); // User joined channel, add to queue.
				}
			} else if (oldChannel === queueVoiceChannel) { // Leaving Queue
				if (member.user.bot) {
					if (newChannel) {
						if (guildIdGuildMemberIdDict[guild.id].length > 0) { // Bot got pulled into another channel
							guild.members.cache.get(guildIdGuildMemberIdDict[guild.id][0]).voice.setChannel(newChannel); // If the use queue is not empty, pull in the next in user queue.
						}
						newVoiceState.setChannel(queueVoiceChannel); // Return bot to queue channel
					}
				} else {
					console.log(`[${guild.name}] | [${member.displayName}] set to leave queue in ${grace_period} seconds`);
					let currentUser = guild.members.cache.get(guildIdGuildMemberIdDict[guild.id][0]);
					setTimeout(() => {
						try {
							if (currentUser.voice.channel !== queueVoiceChannel) {
								guildIdGuildMemberIdDict[guild.id].splice(guildIdGuildMemberIdDict[guild.id].indexOf(member.id), 1); // User left channel, remove from queue.
							}
						} catch (e) { console.error(e); }
					}, grace_period * 1000); // 5 min timer
				}
			}
		}
	} catch (e) { console.error(e); }
});

function hasPermissions(message) { 
	const regex = RegExp(`\bmod\b|\bmods\b`);
	return message.member.roles.cache.some(role => regex.test(role.name.toLowerCase()) || message.member.id === message.guild.ownerID);
}

async function start(message, guildIdVoiceChannelDictId) {
	try {
		if (!hasPermissions(message)) return;
		const guild = message.guild;
		const queueVoiceChannel = guild.channels.cache.get(await guildIdVoiceChannelDictId.get(guild.id));

		if (!queueVoiceChannel) {
			message.channel.send(`Queue channel not set yet:\n${prefix}${QUEUE_CMD} {channel name}`);
		} else {
			await queueVoiceChannel.join().then(connection => {
				connection.voice.setSelfMute(true);
			});
			console.log("Successfully connected.");
		}
	} catch (e) { console.error(e); }
}

async function displayQueue(message) {
	try {
		const guild = message.guild;
		const memberIdQueue = guildIdGuildMemberIdDict[guild.id];
		if (!memberIdQueue || memberIdQueue.length === 0) {
			message.channel.send(`Current Queue: Empty`);
		} else {
			var i = 0;
			message.channel.send(`Current Queue:` + memberIdQueue.map(gId => ` [${++i}] ` + guild.members.cache.get(gId).displayName));
		}
	} catch (e) { console.error(e); }
}

async function setQueueChannel(message, guildIdVoiceChannelDictId, guildIdGuildMemberIdDict) {
	try {
		if (!hasPermissions(message)) return;
		const guild = message.guild;
		const voiceChannelId = await guildIdVoiceChannelDictId.get(guild.id);
		const channelName = message.content.slice(`${prefix}${START_CMD}`.length).trim(); // extract channel name from message.

		if (channelName === "") { // Display current guild
			if (voiceChannelId) {
				return message.channel.send(`Current queue channel: [${guild.channels.cache.get(voiceChannelId).name}]`);
			} else {
				return message.channel.send(`Queue channel not set yet:\n${prefix}${QUEUE_CMD} {channel name}`);
			}
		} else { // Set current guild
			const availableVoiceChannels = guild.channels.cache.filter(c => c.type === 'voice');
			const voiceChannel = availableVoiceChannels.find(x => x.name.toUpperCase() === channelName.toUpperCase());

			if (!voiceChannel) return message.channel.send(`Invalid channel name!\nValid channels:${availableVoiceChannels.map(a => ` [${a.name}]`)}`);
			const permissions = voiceChannel.permissionsFor(message.client.user);
			if (!permissions.has('CONNECT')) {
				return message.channel.send('I need the permissions to join your voice channel!');
			}

			await guildIdVoiceChannelDictId.set(guild.id, voiceChannel.id);
			guildIdGuildMemberIdDict[message.guild.id] = voiceChannel.members.filter(m => !m.user.bot).map(m => m.id);
			message.channel.send(`Queue channel set to [${channelName}].`);
			if (!guild.members.cache.get(guildIdGuildMemberIdDict[guild.id][0])) {
				start(message, guildIdVoiceChannelDictId);
			}
		}
	} catch (e) { console.error(e); }
}

async function help(message) {
	message.channel.send(`**How to use:**`
		+ `\n1. Setup using ${prefix}${QUEUE_CMD}, then ${prefix}${START_CMD} as explained below.`
		+ `\n2. When you want to pull in the next user (whoever has been in queue the longest), pull the bot into your channel and it will automatically swap with them.`
		+ `\n3. When you are done, right-click the bot, and Disconnect it.`);
	return message.channel.send(`**Commands:**`
		+ `\n${prefix}${QUEUE_CMD} {channel name}\t | Set the queue channel (do this before ${prefix}${START_CMD}).`
		+ `\n${prefix}${START_CMD}\t\t\t\t\t\t\t\t\t | Start the Queue Bot.`
		+ `\n${prefix}${DISPLAY_CMD}\t\t\t\t\t\t\t\t\t | Display the current waiting queue.`);
}

// Monitor for chat commands
client.on('message', async message => {
	if (message.author.bot) return;                     // Ignore if message is from this bot.
	if (!message.content.startsWith(prefix)) return;    // Ignore if message does not have command prefix.
	content = message.content.trim();
	console.log(message.content);

	if (content === `${prefix}${START_CMD}`) {
		start(message, guildIdVoiceChannelDictId);
	} else if (content === `${prefix}${DISPLAY_CMD}`) {
		displayQueue(message, guildIdGuildMemberIdDict);
	} else if (content.startsWith(`${prefix}${QUEUE_CMD}`)) {
		setQueueChannel(message, guildIdVoiceChannelDictId, guildIdGuildMemberIdDict);
	} else if (content === `${prefix}${HELP_CMD}`) {
		help(message);
	}
});