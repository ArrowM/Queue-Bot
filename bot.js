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
let guildVoiceChannelDict = (function () {
	return new Keyv(`${database_type}://${database_username}:${database_password}@${database_uri}`); // guild.id | [voice GuildChannel.id, ...]
})();
const guildGuildMemberIdDict = [];	// guild.id | voice GuildChannel.id | [guildMember.id, ...]
const guildDisplayMessageDict = []; // guild.id | voice GuildChannel.id | text GuildChannel.id | [message.id, ...]

client.login(token);
guildVoiceChannelDict.on('error', err => console.error('Keyv connection error:', err));

// Cleanup deleted guilds and channels at startup. Then read in members inside tracked queues.
client.once('ready', async () => { 
	const storedGuildVoiceChannelDict = await guildVoiceChannelDict.entries();
	for (const guildIdVoiceChannelPair of storedGuildVoiceChannelDict) {
		const guild = client.guilds.cache.get(guildIdVoiceChannelPair[0]);
		// Cleanup deleted Guilds
		if (!guild) {
			await guildVoiceChannelDict.delete(guildIdVoiceChannelPair[0]);
		}
		else {
			const voiceChannelIds = guildIdVoiceChannelPair[1] ? guildIdVoiceChannelPair[1].split(",") : [];
			for (const voiceChannelId of voiceChannelIds) {
				const voiceChannel = client.channels.cache.get(voiceChannelId);
				if (voiceChannel) {
					// Initialize member queue
					if (!guildGuildMemberIdDict[guild.id]) {
						guildGuildMemberIdDict[guild.id] = [];
					}
					guildGuildMemberIdDict[guild.id][voiceChannel.id] = voiceChannel.members.filter(member => !member.user.bot).map(member => member.id);
				}	
				else {
					// Cleanup deleted Channels
					voiceChannelIds.splice(voiceChannelIds.indexOf(voiceChannel.id), 1);
					guildVoiceChannelDict.set(guild, voiceChannelIds.toString());
				}
			}
		}
	}
	console.log('Ready!');
});
client.once('reconnecting', async () => {
	for (const guildId of Object.keys(guildGuildMemberIdDict)) {
		const availableVoiceChannels = Object.keys(guildGuildMemberIdDict[guildId]).map(id => client.channels.cache.get(id));
		for (const voiceChannel of availableVoiceChannels) {
			// Remove users who left during disconnect
			for (let i = 0; i < guildGuildMemberIdDict[guildId][voiceChannel].length; i++) {
				const memberId = guildGuildMemberIdDict[guildId][voiceChannel][i];
				if (!voiceChannel.members.includes(memberId)) {
					guildGuildMemberIdDict[guildId][voiceChannel].splice(i, 1); i--;
				}
			}
			// Add users who joined during disconnect
			for (let i = 0; i < voiceChannel.members.length; i++) {
				const memberId = voiceChannel.members[i].id;
				if (!member.user.bot && !guildGuildMemberIdDict[guildId][voiceChannel].includes(memberId)) {
					guildGuildMemberIdDict[guildId][voiceChannel].push(memberId);
				}
			}
		}
	}
	console.log('Reconnecting!');
});
client.once('disconnect', () => {
	console.log('Disconnect!');
});
// Error log
// client.on('debug', console.log);

// Monitor for users joining voice channels
client.on('voiceStateUpdate', async (oldVoiceState, newVoiceState) => {
	const oldVoiceChannel = oldVoiceState.channel;
	const newVoiceChannel = newVoiceState.channel;
	const member = newVoiceState.member;
	const guild = newVoiceState.guild;

	if (oldVoiceChannel !== newVoiceChannel) {
		if (!guildGuildMemberIdDict[guild.id]) {
			guildGuildMemberIdDict[guild.id] = []; // Initialize empty queue if necessary
		}

		const availableVoiceChannels = Object.keys(guildGuildMemberIdDict[guild.id]).map(id => client.channels.cache.get(id));

		if (availableVoiceChannels.includes(newVoiceChannel) || availableVoiceChannels.includes(oldVoiceChannel)) {
			if (member.user.bot) {
				if (newVoiceChannel && !availableVoiceChannels.includes(newVoiceChannel)) {
					if (guildGuildMemberIdDict[guild.id][oldVoiceChannel.id].length > 0) { 
						// Person to swap
						guild.members.cache.get(guildGuildMemberIdDict[guild.id][oldVoiceChannel.id][0]).voice.setChannel(newVoiceChannel); // If the use queue is not empty, pull in the next in user queue
						guildGuildMemberIdDict[guild.id][oldVoiceChannel.id].shift();
					}
					newVoiceState.setChannel(oldVoiceChannel); // Return bot to queue channel
				}
			}
			else {
				console.log(`[${guild.name}] | [${member.displayName}] moved from [${oldVoiceChannel ? oldVoiceChannel.name : null}] to [${newVoiceChannel ? newVoiceChannel.name : null}]`);

				if (availableVoiceChannels.includes(newVoiceChannel) && !guildGuildMemberIdDict[guild.id][newVoiceChannel.id].includes(member.id)) { // Joining Queue
					guildGuildMemberIdDict[guild.id][newVoiceChannel.id].push(member.id); // User joined channel, add to queue
					updateDisplayQueue(guild, guildDisplayMessageDict, guildGuildMemberIdDict, [oldVoiceChannel, newVoiceChannel]);
				}
				if (availableVoiceChannels.includes(oldVoiceChannel)) {
					console.log(`[${guild.name}] | [${member.displayName}] set to leave [${oldVoiceChannel.name}] queue in ${grace_period} seconds`);
					let timer = 0;
					while (timer < grace_period) {
						await sleep(1000);
						if (member.voice.channel === oldVoiceChannel) return;
						timer++;
					}
					guildGuildMemberIdDict[guild.id][oldVoiceChannel.id].splice(guildGuildMemberIdDict[guild.id][oldVoiceChannel.id].indexOf(member.id), 1); // User left channel, remove from queue
					console.log(`[${guild.name}] | [${member.displayName}] left [${oldVoiceChannel.name}] queue`);
				}
				updateDisplayQueue(guild, guildDisplayMessageDict, guildGuildMemberIdDict, [oldVoiceChannel, newVoiceChannel]);
			}
		}
	}
});

async function hasPermissions(message) { 
	const regex = RegExp(permissions_regexp);
	return message.member.roles.cache.some(role => regex.test(role.name.toLowerCase()) || message.member.id === message.guild.ownerID);
}

async function fetchVoiceChannel(cmd, message, guildGuildMemberIdDict) {
	const guild = message.guild;
	let voiceChannel;

	if (guildGuildMemberIdDict[guild.id]) {
		// Extract channel name from message
		const channelArg = message.content.slice(`${prefix}${cmd}`.length).trim();
		const availableVoiceChannels = Object.keys(guildGuildMemberIdDict[guild.id]).map(id => client.channels.cache.get(id));

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

async function start(message, guildGuildMemberIdDict) {
	if (!await hasPermissions(message)) return;

	const voiceChannel = await fetchVoiceChannel(start_cmd, message, guildGuildMemberIdDict);

	if (voiceChannel) {
		await voiceChannel.join().then(connection => {
			connection.voice.setSelfMute(true);
		});
		console.log("Successfully connected.");
	}
}

async function generateEmbed(voiceChannel, guildGuildMemberIdDict) {
	const memberIdQueue = guildGuildMemberIdDict[voiceChannel.guild.id][voiceChannel.id];
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
}

async function displayQueue(message, guildGuildMemberIdDict, guildDisplayMessageDict) {
	if (!await hasPermissions(message)) return;
	const guild = message.guild;
	const textChannel = message.channel;
	const voiceChannel = await fetchVoiceChannel(display_cmd, message, guildGuildMemberIdDict);

	if (voiceChannel) {
		let embedList = await generateEmbed(voiceChannel, guildGuildMemberIdDict);

		// Initialize display message queue
		if (!guildDisplayMessageDict[guild.id]) {
			guildDisplayMessageDict[guild.id] = [];
		}
		if (!guildDisplayMessageDict[guild.id][voiceChannel.id]) {
			guildDisplayMessageDict[guild.id][voiceChannel.id] = [];
		}

		// Remove old display list
		if (guildDisplayMessageDict[guild.id][voiceChannel.id][textChannel.id]) {
			for (const storedEmbed of Object.values(guildDisplayMessageDict[guild.id][voiceChannel.id][textChannel.id])) {
				storedEmbed.delete();
			}
		}

		// Create new display list
		guildDisplayMessageDict[guild.id][voiceChannel.id][textChannel.id] = [];
		embedList.forEach(queueEmbed =>
			textChannel.send(queueEmbed).then(msg =>
				guildDisplayMessageDict[guild.id][voiceChannel.id][textChannel.id].push(msg)
			)
		);
	}
}

async function updateDisplayQueue(guild, guildDisplayMessageDict, guildGuildMemberIdDict, voiceChannels) {
	if (guildDisplayMessageDict[guild.id]) {
		for (const voiceChannel of voiceChannels) {
			if (voiceChannel && guildDisplayMessageDict[guild.id][voiceChannel.id]) {
				let embedList = await generateEmbed(voiceChannel, guildGuildMemberIdDict);
				for (const textChannelId of Object.keys(guildDisplayMessageDict[guild.id][voiceChannel.id])) {
					storedEmbeds = Object.values(guildDisplayMessageDict[guild.id][voiceChannel.id][textChannelId]);
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
						guildDisplayMessageDict[guild.id][voiceChannel.id][textChannel.id] = [];
						// Create new display list
						embedList.forEach(queueEmbed =>
							textChannel.send(queueEmbed).then(
								msg => guildDisplayMessageDict[guild.id][voiceChannel.id][channel].push(msg)
							)
						);
					}
				}
			}
		}
	}
}

async function setQueueChannel(message, guildVoiceChannelDict, guildGuildMemberIdDict) {
	if (!await hasPermissions(message)) return;
	const guild = message.guild;
	const availableVoiceChannels = guild.channels.cache.filter(c => c.type === 'voice');

	// Get stored voice channel list from database
	const voiceChannelsString = await guildVoiceChannelDict.get(guild.id);
	const voiceChannelIds = voiceChannelsString ? voiceChannelsString.split(",") : [];

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
			if (!guildGuildMemberIdDict[guild.id]) {
				guildGuildMemberIdDict[guild.id] = [];
			}			

			// Toggle Queue
			if (voiceChannelIds.includes(voiceChannel.id)) { // If it's in the list, remove it
				voiceChannelIds.splice(voiceChannelIds.indexOf(voiceChannel.id), 1);
				delete guildGuildMemberIdDict[guild.id][voiceChannel.id];
				message.channel.send(`Deleted queue for \`${voiceChannel.name}\`.`);
			}
			else { // If it's not in the list, add it
				voiceChannelIds.push(voiceChannel.id);
				guildGuildMemberIdDict[guild.id][voiceChannel.id] = voiceChannel.members.filter(m => !m.user.bot).map(m => m.id);
				message.channel.send(`Created queue for \`${voiceChannel.name}\`.`);
			}

			// Store channel to database
			guildVoiceChannelDict.set(guild.id, voiceChannelIds.toString());
		}
	}
}

async function help(message) {
	const embed = {
		"embed": {
			"title": "How to use",
			"color": 4689537,
			"author": {
				"name": "Queue Bot",
				"url": "https://top.gg/bot/679018301543677959",
				"icon_url": "https://images.discordapp.net/avatars/679018301543677959/e079987fa20e09e43f4327147b30b54e.png"
			},
			"fields": [
				{
					"name": "Access",
					"value": "All commands are restricted to owners or users with `mod` or `mods` in their server roles"
				},
				{
					"name": "!q ",
					"value": "Create or delete queues using  `!q {channel name}`"
				},
				{
					"name": "!d",
					"value": "Display queues in chat using  `!d {channel name}`. Display messages stay updated."
				},
				{
					"name": "!s",
					"value": "Add the bot to a voice channel using  `!s {channel name}`. The bot can be pulled into a non-queue channel and it will automatically swap with the next person in the channel queue. Right-click bot and disconnect from the voice channel when done."
				}
			]
		}
	};
	message.channel.send(embed);
}

// Monitor for chat commands
client.on('message', async message => {
	if (message.author.bot || !message.content.startsWith(prefix)) return;
	content = message.content.trim();
	console.log(message.content);

	if (content.startsWith(prefix + start_cmd)) {
		start(message, guildGuildMemberIdDict);

	} else if (content.startsWith(prefix + display_cmd)) {
		displayQueue(message, guildGuildMemberIdDict, guildDisplayMessageDict);

	} else if (content.startsWith(prefix + queue_cmd)) {
		setQueueChannel(message, guildVoiceChannelDict, guildGuildMemberIdDict);

	} else if (content.startsWith(prefix + help_cmd)) {
		help(message);
	}
});