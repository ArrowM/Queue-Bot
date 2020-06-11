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
	// kick_cmd,
	queue_cmd,
	start_cmd
} = require('./config.json');

// Setup client
const { Client } = require('discord.js');
const client = new Client({ ws: { intents: ['GUILDS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES'] } });

// Default DB Settings
const defaultDBData = [grace_period, prefix, color, "", "", "", "", "", "", ""];
const CustomFields = {
	GRACE: { index: 0, str: "grace period", cmd: grace_period_cmd },
	PREFIX: { index: 1, str: "command prefix", cmd: command_prefix_cmd },
	COLOR: { index: 2, str: "color", cmd: color_cmd },
	// KICK: { index: 3, str: "kick", cmd: kick_cmd }
};
Object.freeze(CustomFields);

// Keyv long term DB storage
const Keyv = require('keyv');
const voiceChannelDict = (function () {
	return new Keyv(`${database_type}://${database_username}:${database_password}@${database_uri}`);	// guild.id | grace_period, [voice Channel.id, ...]
})();
voiceChannelDict.on('error', err => console.error('Keyv connection error:', err));

// Short term storage
const guildMemberDict = [];		// guild.id | voice GuildChannel.id | [guildMember.id, ...]
const displayEmbedDict = [];	// guild.id | voice GuildChannel.id | text GuildChannel.id | [message.id, ...]

// Storage Mutexes
const Mutex = require('async-mutex');
const voiceChannelLocks = new Map();	// Map<guild.id, MutexInterface>;
const guildMemberLocks = new Map();		// Map<guild.id, MutexInterface>;
const displayEmbedLocks = new Map();	// Map<guild.id, MutexInterface>;


// Functions
const sleep = m => new Promise(r => setTimeout(r, m));

async function setupLocks(guildId) {
	voiceChannelLocks.set(guildId, new Mutex.Mutex());
	guildMemberLocks.set(guildId, new Mutex.Mutex());
	displayEmbedLocks.set(guildId, new Mutex.Mutex());
}

client.login(token);
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
			await setupLocks(guild.id);
			// LOCK
			const guildMemberRelease = await guildMemberLocks.get(guild.id).acquire();
			const displayEmbedRelease = await displayEmbedLocks.get(guild.id).acquire();
			const voiceChannelRelease = await voiceChannelLocks.get(guild.id).acquire();
			try {
				const dbData = guildIdVoiceChannelPair[1];
				const otherData = dbData.slice(0, 10);
				const voiceChannelIds = dbData.slice(10);
				// Set unset values to default
				for (let i = 0; i < otherData.length; i++) {
					if (!otherData[i]) otherData[i] = defaultDBData[i];
				}

				for (const voiceChannelId of voiceChannelIds) {
					const voiceChannel = client.channels.cache.get(voiceChannelId);
					if (voiceChannel) {
						// Initialize member queue
						guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];

						guildMemberDict[guild.id][voiceChannel.id] = voiceChannel.members.filter(member => !member.user.bot).map(member => member.id);
					}
					else {
						// Cleanup deleted Channels
						voiceChannelIds.splice(voiceChannelIds.indexOf(voiceChannelId), 1);
					}
				}
				await voiceChannelDict.set(guild.id, otherData.concat(voiceChannelIds));
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
					// console.log(`[${guild.name}] | [${member.displayName}] moved from [${oldVoiceChannel ? oldVoiceChannel.name : null}] to [${newVoiceChannel ? newVoiceChannel.name : null}]`);

					if (availableVoiceChannels.includes(newVoiceChannel) && !guildMemberDict[guild.id][newVoiceChannel.id].includes(member.id)) {
						// User joined channel, add to queue
						guildMemberDict[guild.id][newVoiceChannel.id].push(member.id); 
						updateDisplayQueue(guild, [oldVoiceChannel, newVoiceChannel]);
					}
					if (availableVoiceChannels.includes(oldVoiceChannel)) {
						// User left channel, start removal process
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

async function fetchVoiceChannel(dbData, cmd, message) {
	const storedPrefix = dbData[1];
	const guild = message.guild;
	let voiceChannel;

	if (guildMemberDict[guild.id]) {
		// Extract channel name from message
		const channelArg = message.content.slice(`${storedPrefix}${cmd}`.length).trim();
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
		message.channel.send(`No queue channels set. Set a queue first using \`${storedPrefix}${queue_cmd} channel name\``
			+ `\nValid channels: ${guild.channels.cache.filter(c => c.type === 'voice').map(channel => ` \`${channel.name}\``)}`);
	}
}

async function start(dbData, message) {
	const voiceChannel = await fetchVoiceChannel(dbData, start_cmd, message);

	if (voiceChannel) {
		await voiceChannel.join().then(connection => {
			connection.voice.setSelfMute(true);
		});
		// console.log("Successfully connected.");
	}
}

async function generateEmbed(dbData, voiceChannel) {
	const storedColor = dbData[2];
	const memberIdQueue = guildMemberDict[voiceChannel.guild.id][voiceChannel.id];
	let embedList = [{
		"embed": {
			"title": `${voiceChannel.name} Queue`,
			"color": storedColor,
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
					"value": voiceChannel.guild.members.cache.get(memberId).displayName
				});
			});
			embedList[i]['embed']['fields'].push(fields);

			sliceStop += maxEmbedSize;
		}
	}
	return embedList;
}

async function displayQueue(dbData, message) {
	const guild = message.guild;
	const textChannel = message.channel;
	const voiceChannel = await fetchVoiceChannel(dbData, display_cmd, message);

	if (voiceChannel) {
		let embedList = await generateEmbed(dbData, voiceChannel);

		if (displayEmbedLocks.get(guild.id)) {
			await displayEmbedLocks.get(guild.id).runExclusive(async () => { // Lock ensures that update is atomic

				// Initialize display message queue
				displayEmbedDict[guild.id] = displayEmbedDict[guild.id] || [];
				
				displayEmbedDict[guild.id][voiceChannel.id] = displayEmbedDict[guild.id][voiceChannel.id] || [];

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
	const currentChannelIds = guild.channels.cache.map(c => c.id);
	const dbData = await voiceChannelDict.get(guild.id);

	if (displayEmbedDict[guild.id] && displayEmbedLocks.get(guild.id)) {
		await displayEmbedLocks.get(guild.id).runExclusive(async () => { // Lock ensures that update is atomic

			for (const voiceChannel of voiceChannels) {
				if (voiceChannel && displayEmbedDict[guild.id][voiceChannel.id]) {

					if (!currentChannelIds.includes(voiceChannel.id)) { // Handled delete channels
						delete displayEmbedDict[guild.id][voiceChannel.id];
						continue;
					}

					const embedList = await generateEmbed(dbData, voiceChannel); 
					for (const textChannelId of Object.keys(displayEmbedDict[guild.id][voiceChannel.id])) {

						if (!currentChannelIds.includes(textChannelId)) { // Handled delete channels
							delete displayEmbedDict[guild.id][voiceChannel.id][textChannelId];
							continue;
						}

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

async function setQueueChannel(dbData, message) {
	const guild = message.guild;
	const availableVoiceChannels = guild.channels.cache.filter(c => c.type === 'voice');
	// Get stored voice channel list from database
	const otherData = dbData.slice(0, 10);
	const voiceChannelIds = dbData.slice(10);

	// Extract channel name from message
	const storedPrefix = otherData[1];
	const channelArg = message.content.slice(`${storedPrefix}${queue_cmd}`.length).trim();

	// No argument. Display current queues
	if (channelArg === "") {
		if (voiceChannelIds.length > 0) {
			message.channel.send(`Current queues: ${voiceChannelIds.map(id => ` \`${guild.channels.cache.get(id).name}\``)}`);
		} else {
			message.channel.send(`No queue channels set.`
				+ `\nSet a new queue channel using \`${storedPrefix}${queue_cmd} {channel name}\``
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
			guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];

			// Toggle Queue
			if (voiceChannelIds.includes(voiceChannel.id)) { // If it's in the list, remove it
				voiceChannelIds.splice(voiceChannelIds.indexOf(voiceChannel.id), 1);
				delete guildMemberDict[guild.id][voiceChannel.id];
				// Remove old display list
				try {
					for (const storedEmbed of Object.values(displayEmbedDict[guild.id][voiceChannel.id][message.channel.id])) {
						storedEmbed.delete();
					}
				} catch {/**/}
				message.channel.send(`Deleted queue for \`${voiceChannel.name}\`.`);
			}
			else { // If it's not in the list, add it
				voiceChannelIds.push(voiceChannel.id);
				guildMemberDict[guild.id][voiceChannel.id] = voiceChannel.members.filter(m => !m.user.bot).map(m => m.id);
				message.channel.send(`Created queue for \`${voiceChannel.name}\`.`);
			}

			// Store channel to database
			await voiceChannelDict.set(guild.id, otherData.concat(voiceChannelIds));
		}
	}
}

async function help(dbData, message) {
	const storedPrefix = dbData[1];
	const storedColor = dbData[2];
	const embed = {
		"embed": {
			"title": "How to use",
			"color": storedColor,
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
					"value": `\`${storedPrefix}${command_prefix_cmd} {new prefix}\` changes the prefix for Queue Bot commands.`
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
	};
	message.author.send(embed);
	message.channel.send("I have sent help to your PMs.");
}

async function setCustomField(dbData, message, field, updateDisplayMsgs, valueRestrictions, extraErrorLine, embed) {
	const storedPrefix = dbData[1];
	const guild = message.guild;
	const newValue = message.content.slice(`${storedPrefix}${command_prefix_cmd}`.length).trim();
	const otherData = dbData.slice(0, 10);
	const voiceChannelIds = dbData.slice(10);

	if (newValue && valueRestrictions(newValue)) {
		otherData[field.index] = newValue;
		// Store channel to database
		await voiceChannelDict.set(guild.id, otherData.concat(voiceChannelIds));
		if (updateDisplayMsgs) updateDisplayQueue(guild, voiceChannelIds.map(id => guild.channels.cache.get(id)));
		message.channel.send(`Set ${field.str} to \`${newValue}\`.`);
	}
	else {
		const msg = {
			"content":
				`The ${field.str} is currently set to \`${otherData[field.index]}\`.`
				+ `\nSet a new ${field.str} using \`${storedPrefix}${field.cmd} {${field.str}}\`.`
				+ '\n' + extraErrorLine
		}
		if (embed) msg["embed"] = embed;
		message.channel.send(msg);
	}
}

// Monitor for chat commands
client.on('message', async message => {
	if (message.author.bot || !(await hasPermissions(message))) return;

	if (!voiceChannelLocks.get(message.guild.id)) await setupLocks(message.guild.id);
	await voiceChannelLocks.get(message.guild.id).runExclusive(async () => { // Lock ensures that update is atomic

		let dbData = await voiceChannelDict.get(message.guild.id);
		if (!dbData) {
			dbData = defaultDBData;
			await voiceChannelDict.set(message.guild.id, dbData);
		}

		const storedPrefix = dbData[1];
		content = message.content;
		// console.log(content.trim());

		// Allow help to be called using both the default and custom prefixes
		if (content === storedPrefix + help_cmd || content === prefix + help_cmd) {
			help(dbData, message);
		}

		if (!content.startsWith(storedPrefix)) return;

		// All the other commands. Use 'await' if they modify the voiceChannel dictionary.
		if (content.startsWith(storedPrefix + start_cmd)) {
			start(dbData, message);

		} else if (content.startsWith(storedPrefix + display_cmd)) {
			displayQueue(dbData, message);

		} else if (content.startsWith(storedPrefix + queue_cmd)) {
			await setQueueChannel(dbData, message);

		// Grace period
		} else if (content.startsWith(storedPrefix + grace_period_cmd)) {
			await setCustomField(dbData, message,
				CustomFields.GRACE,
				true,
				function (time) { return time >= 0 && time <= 600 },
				'Grace period must be between `0` and `600` seconds.',
				null
			);

		// Command prefix
		} else if (content.startsWith(storedPrefix + command_prefix_cmd)) {
			setCustomField(dbData, message,
				CustomFields.PREFIX,
				false,
				function () { return true },
				'',
				null
			);

		// Color
		} else if (content.startsWith(storedPrefix + color_cmd)) {
			await setCustomField(dbData, message,
				CustomFields.COLOR,
				true,
				function (color) { return /^#[0-9A-F]{6}$/i.test(color) },
				'Use HEX color:',
				{ "title": "Hex color picker", "url": "https://htmlcolorcodes.com/color-picker/", "color": dbData[2] }
			);
		}
	})
});