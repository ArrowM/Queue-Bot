"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_json_1 = require("./config.json");
require('events').EventEmitter.defaultMaxListeners = 40;
const discord_js_1 = require("discord.js");
const client = new discord_js_1.Client({ ws: { intents: ['GUILDS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES'] } });
const defaultDBData = [config_json_1.gracePeriod, config_json_1.prefix, config_json_1.color, "", "", "", "", "", "", ""];
const ServerSettings = {
    [config_json_1.gracePeriodCmd]: { index: 0, str: "grace period" },
    [config_json_1.commandPrefixCmd]: { index: 1, str: "command prefix" },
    [config_json_1.colorCmd]: { index: 2, str: "color" },
};
Object.freeze(ServerSettings);
const keyv_1 = __importDefault(require("keyv"));
const channelDict = new keyv_1.default(`${config_json_1.databaseType}://${config_json_1.databaseUsername}:${config_json_1.databasePassword}@${config_json_1.databaseUri}`);
channelDict.on('error', (err) => console.error('Keyv connection error:', err));
const guildMemberDict = [];
const displayEmbedDict = [];
const async_mutex_1 = require("async-mutex");
const channelLocks = new Map();
const guildMemberLocks = new Map();
const displayEmbedLocks = new Map();
const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));
function setupLocks(guildId) {
    return __awaiter(this, void 0, void 0, function* () {
        channelLocks.set(guildId, new async_mutex_1.Mutex());
        guildMemberLocks.set(guildId, new async_mutex_1.Mutex());
        displayEmbedLocks.set(guildId, new async_mutex_1.Mutex());
    });
}
function fetchStoredChannels(dbData, guild) {
    return __awaiter(this, void 0, void 0, function* () {
        const channels = [];
        for (let i = 10; i < dbData.length; i++) {
            const channel = guild.channels.cache.get(dbData[i]);
            if (channel) {
                channels.push(channel);
            }
            else {
                dbData.splice(i, 1);
            }
        }
        yield channelDict.set(guild.id, dbData);
        return channels;
    });
}
const gracePeriodCache = new Map();
function getGracePeriodString(gracePeriod) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!gracePeriodCache.has(gracePeriod)) {
            let result;
            if (gracePeriod === '0') {
                result = '';
            }
            else {
                const graceMinutes = Math.round(gracePeriod / 60);
                const graceSeconds = gracePeriod % 60;
                const timeString = (graceMinutes > 0 ? graceMinutes + ' minute' : '') + (graceMinutes > 1 ? 's' : '')
                    + (graceMinutes > 0 && graceSeconds > 0 ? ' and ' : '')
                    + (graceSeconds > 0 ? graceSeconds + ' second' : '') + (graceSeconds > 1 ? 's' : '');
                result = ` If you leave, you have ${timeString} to rejoin before being removed from the queue.`;
            }
            gracePeriodCache.set(gracePeriod, result);
        }
        return gracePeriodCache.get(gracePeriod);
    });
}
function generateEmbed(dbData, channel) {
    return __awaiter(this, void 0, void 0, function* () {
        const prefix = dbData[1];
        const storedColor = dbData[2];
        let embedList;
        yield guildMemberLocks.get(channel.guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            const queueMembers = guildMemberDict[channel.guild.id][channel.id];
            embedList = [{
                    "title": `${channel.name} queue`,
                    "color": storedColor,
                    "description": channel.type === 'voice' ?
                        `Join the **${channel.name}** voice channel to join this queue.` + (yield getGracePeriodString(dbData[0])) :
                        `Type \`${prefix}${config_json_1.joinCmd} ${channel.name}\` to join or leave this queue.`,
                    "fields": [{
                            "inline": false,
                            "name": `Current queue length: **${queueMembers ? queueMembers.length : 0}**`,
                            "value": "\u200b"
                        }]
                }];
            if (!queueMembers || queueMembers.length === 0) {
                embedList[0]['fields'][0]['value'] = 'No members in queue.';
            }
            else {
                const maxEmbedSize = 1;
                let position = 0;
                let sliceStop = maxEmbedSize - 1;
                for (let i = 0; i <= queueMembers.length / maxEmbedSize; i++) {
                    if (i > 0) {
                        embedList.push({
                            "title": null,
                            "color": storedColor,
                            "description": null,
                            "fields": []
                        });
                    }
                    const fields = [];
                    queueMembers.slice(position, sliceStop).map(queueMember => {
                        const member = channel.guild.members.cache.get(queueMember.id);
                        if (member) {
                            fields.push({
                                "inline": false,
                                "name": ++position,
                                "value": member.displayName + (queueMember.msg ? ' -- ' + queueMember.msg : '')
                            });
                        }
                        else {
                            queueMembers.splice(queueMembers.findIndex(member => member.id === queueMember.id), 1);
                        }
                    });
                    embedList[i]['fields'] = fields;
                    sliceStop += maxEmbedSize;
                }
            }
        }));
        return embedList;
    });
}
function updateDisplayQueue(guild, queues) {
    return __awaiter(this, void 0, void 0, function* () {
        const currentChannelIds = guild.channels.cache.map(channel => channel.id);
        const dbData = yield channelDict.get(guild.id);
        yield displayEmbedLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            if (displayEmbedDict[guild.id]) {
                for (const queue of queues) {
                    if (queue && displayEmbedDict[guild.id][queue.id]) {
                        const embedList = yield generateEmbed(dbData, queue);
                        for (const textChannelId of Object.keys(displayEmbedDict[guild.id][queue.id])) {
                            if (currentChannelIds.includes(textChannelId)) {
                                const storedEmbeds = Object.values(displayEmbedDict[guild.id][queue.id][textChannelId])
                                    .map((msgId) => guild.channels.cache.get(textChannelId)
                                    .messages.cache.get(msgId));
                                let createNewEmbed = false;
                                if (storedEmbeds.length === embedList.length) {
                                    for (let i = 0; i < embedList.length; i++) {
                                        if (storedEmbeds[i]) {
                                            yield storedEmbeds[i].edit({ embed: embedList[i] }).catch(() => createNewEmbed = true);
                                        }
                                        else {
                                            createNewEmbed = true;
                                        }
                                    }
                                }
                                if (storedEmbeds.length !== embedList.length || createNewEmbed) {
                                    const textChannel = guild.channels.cache.get(textChannelId);
                                    for (const storedEmbed of Object.values(storedEmbeds)) {
                                        if (storedEmbed)
                                            yield storedEmbed.delete().catch(() => null);
                                        ;
                                    }
                                    displayEmbedDict[guild.id][queue.id][textChannelId] = [];
                                    embedList.forEach(queueEmbed => {
                                        textChannel.send({ embed: queueEmbed })
                                            .then((msg) => displayEmbedDict[guild.id][queue.id][textChannelId].push(msg.id))
                                            .catch((e) => console.log('Error in updateDisplayQueue: ' + e));
                                    });
                                }
                            }
                            else {
                                delete displayEmbedDict[guild.id][queue.id];
                            }
                        }
                    }
                }
            }
        }));
    });
}
function send(message, messageToSend) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = message.channel;
        if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
            return message.channel.send(messageToSend);
        }
        else {
            return message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``);
        }
    });
}
function checkAfterLeaving(member, guild, oldVoiceChannel, immediateUpdate) {
    return __awaiter(this, void 0, void 0, function* () {
        const gracePeriod = (yield channelDict.get(guild.id))[0];
        let timer = 0;
        if (!immediateUpdate)
            while (timer < gracePeriod) {
                yield sleep(2000);
                if (member.voice.channel === oldVoiceChannel)
                    return;
                timer += 2;
            }
        const guildMembers = guildMemberDict[guild.id][oldVoiceChannel.id];
        yield guildMemberLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            if (guildMembers) {
                guildMembers.splice(guildMembers.findIndex((queueMember) => queueMember.id === member.id), 1);
            }
        }));
        updateDisplayQueue(guild, [oldVoiceChannel]);
    });
}
function extractChannel(availableChannels, parsed, message) {
    let channel = availableChannels.find(channel => { var _a; return channel.id === ((_a = message.mentions.channels.array()[0]) === null || _a === void 0 ? void 0 : _a.id); });
    const splitArgs = parsed.arguments.split(' ');
    for (let i = splitArgs.length; i > 0; i--) {
        if (channel)
            break;
        const channelNameToCheck = splitArgs.slice(0, i).join(' ');
        channel = availableChannels.find(channel => channel.name === channelNameToCheck) ||
            availableChannels.find(channel => channel.name.localeCompare(channelNameToCheck, undefined, { sensitivity: 'accent' }) === 0);
    }
    return channel;
}
function findChannel(availableChannels, parsed, message, includeMention, type, errorOnNoneFound) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = extractChannel(availableChannels, parsed, message);
        if (channel)
            return channel;
        if (errorOnNoneFound) {
            let response;
            if (availableChannels.length === 0) {
                response = 'No ' + (type ? `**${type}** ` : '') + 'queue channels set.'
                    + '\nSet a ' + (type ? `${type} ` : '') + `queue first using \`${config_json_1.prefix}${config_json_1.queueCmd} {channel name}\``;
            }
            else {
                response = 'Invalid ' + (type ? `**${type}** ` : '') + `channel name! Try \`${parsed.prefix}${parsed.command} `;
                if (availableChannels.length === 1) {
                    response += availableChannels[0].name + (includeMention ? ' @{user}' : '') + '`.';
                }
                else {
                    response += '{channel name}' + (includeMention ? ' @{user}' : '') + '`.'
                        + '\nAvailable ' + (type ? `**${type}** ` : '') + `channel names: ${availableChannels.map(channel => ' `' + channel.name + '`')}`;
                }
            }
            send(message, response);
        }
    });
}
function fetchChannel(dbData, parsed, message, includeMention, type) {
    return __awaiter(this, void 0, void 0, function* () {
        const channels = yield fetchStoredChannels(dbData, message.guild);
        const guild = message.guild;
        if (guildMemberDict[guild.id] && channels.length > 0) {
            const availableChannels = type ?
                channels.filter(channel => channel.type === type) :
                channels;
            if (availableChannels.length === 1) {
                return availableChannels[0];
            }
            else {
                return yield findChannel(availableChannels, parsed, message, includeMention, type, true);
            }
        }
        else {
            send(message, `No queue channels set.`
                + `\nSet a queue first using \`${parsed.prefix}${config_json_1.queueCmd} {channel name}\``);
            return null;
        }
    });
}
function start(dbData, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = yield fetchChannel(dbData, parsed, message, false, 'voice');
        if (channel) {
            if (!channel.permissionsFor(message.guild.me).has('CONNECT')) {
                send(message, 'I need the permissions to join your voice channel!');
            }
            else if (channel.type === 'voice') {
                yield channel.join()
                    .then((connection) => { if (connection)
                    connection.voice.setSelfMute(true); })
                    .catch((e) => console.log('Error in start: ' + e));
            }
            else {
                send(message, "I can only join voice channels.");
            }
        }
    });
}
function displayQueue(dbData, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const guild = message.guild;
        const textChannel = message.channel;
        const channel = yield fetchChannel(dbData, parsed, message, false);
        if (channel) {
            const embedList = yield generateEmbed(dbData, channel);
            yield displayEmbedLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                var _a;
                displayEmbedDict[guild.id] = displayEmbedDict[guild.id] || [];
                displayEmbedDict[guild.id][channel.id] = displayEmbedDict[guild.id][channel.id] || [];
                const embedIds = displayEmbedDict[guild.id][channel.id][textChannel.id];
                if (embedIds)
                    for (const embedId of embedIds) {
                        const embed = (_a = guild.channels.cache.get(textChannel.id)) === null || _a === void 0 ? void 0 : _a.messages.cache.get(embedId);
                        if (embed)
                            yield embed.delete().catch(() => null);
                        ;
                    }
                displayEmbedDict[guild.id][channel.id][textChannel.id] = [];
                embedList.forEach(queueEmbed => send(message, { embed: queueEmbed })
                    .then(msg => { displayEmbedDict[guild.id][channel.id][textChannel.id].push(msg.id); })
                    .catch((e) => console.log('Error in displayQueue: ' + e)));
            }));
        }
    });
}
function setQueueChannel(dbData, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const prefix = parsed.prefix;
        const parsedArgs = parsed.arguments;
        const guild = message.guild;
        const channels = guild.channels.cache.filter(channel => channel.type !== 'category').array();
        const otherData = dbData.slice(0, 10);
        const storedChannels = yield fetchStoredChannels(dbData, message.guild);
        if (!parsedArgs) {
            if (storedChannels.length > 0) {
                send(message, `Current queues: ${storedChannels.map(ch => ` \`${ch.name}\``)}`);
            }
            else {
                send(message, `No queue channels set.`
                    + `\nSet a new queue channel using \`${prefix}${config_json_1.queueCmd} {channel name}\``);
            }
        }
        else {
            const channel = yield findChannel(channels, parsed, message, false, null, true);
            if (channel) {
                guildMemberLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                    guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];
                    if (storedChannels.includes(channel)) {
                        storedChannels.splice(storedChannels.indexOf(channel), 1);
                        delete guildMemberDict[guild.id][channel.id];
                        yield displayEmbedLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                            if (displayEmbedDict[guild.id] && displayEmbedDict[guild.id][channel.id]) {
                                for (const [embedChannelId, embedIds] of displayEmbedDict[guild.id][channel.id].entries()) {
                                    const embedChannel = guild.channels.cache.get(embedChannelId);
                                    if (embedChannel) {
                                        for (const embedId of embedIds) {
                                            const embed = embedChannel.messages.cache.get(embedId);
                                            if (embed)
                                                yield embed.delete().catch(() => null);
                                            ;
                                        }
                                    }
                                }
                            }
                        }));
                        send(message, `Deleted queue for \`${channel.name}\`.`);
                    }
                    else {
                        storedChannels.push(channel);
                        if (channel.type === 'voice') {
                            guildMemberDict[guild.id][channel.id] = channel.members
                                .filter((member) => !member.user.bot)
                                .map((member) => {
                                return { id: member.id, msg: null };
                            });
                        }
                        send(message, `Created queue for \`${channel.name}\`.`);
                    }
                    yield channelDict.set(guild.id, otherData.concat(storedChannels.map(ch => ch.id)));
                }));
            }
        }
    });
}
function joinTextChannel(dbData, parsed, message, hasPermission) {
    return __awaiter(this, void 0, void 0, function* () {
        const guild = message.guild;
        if (hasPermission) {
            parsed.arguments = parsed.arguments.replace(/<@!?\d+>/gi, '').trim();
        }
        const membersToAdd = message.mentions.members.size > 0 ? message.mentions.members.array() : [message.member];
        const channel = yield fetchChannel(dbData, parsed, message, message.mentions.members.size > 0, 'text');
        if (channel) {
            const customMessage = parsed.arguments.replace(channel.name, '').trim().substring(0, 200);
            yield guildMemberLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                guildMemberDict[guild.id][channel.id] = guildMemberDict[guild.id][channel.id] || [];
                const guildMembers = guildMemberDict[guild.id][channel.id];
                for (const member of membersToAdd) {
                    if (guildMembers.some((queueMember) => queueMember.id === member.id)) {
                        guildMembers.splice(guildMembers.findIndex((queueMember) => queueMember.id === member.id), 1);
                        send(message, `Removed \`${member.displayName}\` from the \`${channel.name}\` queue.`);
                    }
                    else {
                        guildMembers.push({ id: member.id, msg: customMessage });
                        send(message, `Added \`${member.displayName}\` to the \`${channel.name}\` queue.`);
                    }
                }
            }));
            updateDisplayQueue(guild, [channel]);
        }
    });
}
function popTextQueue(dbData, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const guild = message.guild;
        const channel = yield fetchChannel(dbData, parsed, message, false, 'text');
        if (channel) {
            const guildMembers = guildMemberDict[guild.id][channel.id];
            if (channel.type === 'text' && guildMembers && guildMembers.length > 0) {
                let nextMemberId;
                yield guildMemberLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                    nextMemberId = guildMembers.shift();
                }));
                send(message, `Pulling next user (<@!${nextMemberId}>) from \`${channel.name}\`.`);
                updateDisplayQueue(guild, [channel]);
            }
            else if (channel.type !== 'text') {
                send(message, `\`${parsed.prefix}${config_json_1.nextCmd}\` can only be used on text channel queues.`);
            }
            else if (guildMembers && guildMembers.length === 0) {
                send(message, `\`${channel.name}\` is empty.`);
            }
        }
    });
}
function kickMember(dbData, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const guild = message.guild;
        parsed.arguments = parsed.arguments.replace(/<@!?\d+>/gi, '').trim();
        const channel = yield fetchChannel(dbData, parsed, message, true);
        const mentionedMembers = message.mentions.members.array();
        if (channel) {
            const guildMembers = guildMemberDict[guild.id][channel.id];
            if (mentionedMembers && guildMembers.length > 0) {
                const kickedMemberIds = [];
                const unfoundMemberIds = [];
                yield guildMemberLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                    for (const member of mentionedMembers) {
                        if (guildMembers.some((queueMember) => queueMember.id === member.id)) {
                            guildMembers.splice(guildMembers.findIndex((queueMember) => queueMember.id === member.id), 1);
                            kickedMemberIds.push(member.id);
                        }
                        else {
                            unfoundMemberIds.push(member.id);
                        }
                    }
                }));
                send(message, ((kickedMemberIds.length > 0) ? 'Kicked' + kickedMemberIds.map(m => ` <@!${m}>`) + ` from \`${channel.name}\` queue.` : '')
                    + ((unfoundMemberIds.length > 0) ? '\nDid not find' + unfoundMemberIds.map(m => ` <@!${m}>`) + ` in \`${channel.name}\` queue.` : ''));
                updateDisplayQueue(guild, [channel]);
            }
            else if (guildMembers.length === 0) {
                send(message, `\`${channel.name}\` is empty.`);
            }
            else if (!mentionedMembers) {
                send(message, `Specify at least one user to kick. For example:`
                    + `\n\`${parsed.prefix}${config_json_1.kickCmd} General @Arrow\``);
            }
        }
    });
}
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
function shuffleQueue(dbData, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const guild = message.guild;
        const channel = yield fetchChannel(dbData, parsed, message, false);
        if (channel) {
            yield guildMemberLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                shuffleArray(guildMemberDict[guild.id][channel.id]);
            }));
            displayQueue(dbData, parsed, message);
            send(message, `\`${channel.name}\` queue shuffled.`);
        }
    });
}
function clearQueue(dbData, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const guild = message.guild;
        const channel = yield fetchChannel(dbData, parsed, message, false);
        if (channel) {
            yield guildMemberLocks.get(guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
                guildMemberDict[guild.id][channel.id] = [];
            }));
            displayQueue(dbData, parsed, message);
            send(message, `\`${channel.name}\` queue cleared.`);
        }
    });
}
function help(dbData, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const storedPrefix = parsed.prefix;
        const storedColor = dbData[2];
        const embeds = [
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
                            "value": `\`${storedPrefix}${config_json_1.joinCmd} {channel name} {OPTIONAL: message to display next to your name}\` joins or leaves a text channel queue.`
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
                            "value": `\`${storedPrefix}${config_json_1.queueCmd} {channel name}\` creates a new queue or deletes an existing queue.`
                                + `\n\`${storedPrefix}${config_json_1.queueCmd}\` shows the existing queues.`
                        },
                        {
                            "name": "Display Queue Members",
                            "value": `\`${storedPrefix}${config_json_1.displayCmd} {channel name}\` displays the members in a queue. These messages stay updated.`
                        },
                        {
                            "name": "Pull Users from Voice Queue",
                            "value": `\`${storedPrefix}${config_json_1.startCmd} {channel name}\` adds the bot to a queue voice channel.`
                                + ` The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue.`
                                + ` Right-click the bot to disconnect it from the voice channel when done. See the example gif below.`
                        },
                        {
                            "name": "Pull Users from Text Queue",
                            "value": `\`${storedPrefix}${config_json_1.nextCmd} {channel name}\` removes the next person in the text queue and displays their name.`
                        },
                        {
                            "name": "Add Others to a Text Channel Queue",
                            "value": `\`${storedPrefix}${config_json_1.joinCmd} {channel name} @{user 1} @{user 2} ...\` adds other people from text channel queue.`
                        },
                        {
                            "name": "Kick Users from Queue",
                            "value": `\`${storedPrefix}${config_json_1.kickCmd} {channel name} @{user 1} @{user 2} ...\` kicks one or more people from a queue.`
                        },
                        {
                            "name": "Clear Queue",
                            "value": `\`${storedPrefix}${config_json_1.clearCmd} {channel name}\` clears a queue.`
                        },
                        {
                            "name": "Shuffle Queue",
                            "value": `\`${storedPrefix}${config_json_1.shuffleCmd} {channel name}\` shuffles a queue.`
                        },
                        {
                            "name": "Change the Grace Period",
                            "value": `\`${storedPrefix}${config_json_1.gracePeriodCmd} {time in seconds}\` changes how long a person can leave a queue before being removed.`
                        },
                        {
                            "name": "Change the Command Prefix",
                            "value": `\`${storedPrefix}${config_json_1.commandPrefixCmd} {new prefix}\` changes the prefix for commands.`
                        },
                        {
                            "name": "Change the Color",
                            "value": `\`${storedPrefix}${config_json_1.colorCmd} {new color}\` changes the color of bot messages.`
                        }
                    ]
                }
            }
        ];
        const channel = yield findChannel(message.guild.channels.cache.array(), parsed, message, false, 'text', false);
        if (parsed.arguments && channel) {
            if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
                embeds.forEach(em => channel.send(em)
                    .catch(e => console.log(e)));
            }
            else {
                message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``);
                embeds.forEach(em => message.author.send(em)
                    .catch(e => console.log(e)));
            }
        }
        else {
            embeds.map(em => {
                message.author.send(em)
                    .catch(e => console.log(e));
            });
            send(message, "I have sent help to your PMs.");
        }
    });
}
function setServerSettings(dbData, parsed, message, updateDisplayMsgs, valueRestrictions, extraErrorLine, embed) {
    return __awaiter(this, void 0, void 0, function* () {
        const setting = ServerSettings[parsed.command];
        const guild = message.guild;
        const otherData = dbData.slice(0, 10);
        const channels = yield fetchStoredChannels(dbData, guild);
        if (parsed.arguments && valueRestrictions) {
            otherData[setting.index] = parsed.arguments;
            yield channelDict.set(guild.id, otherData.concat(channels.map(ch => ch.id)));
            if (updateDisplayMsgs)
                updateDisplayQueue(guild, channels);
            send(message, `Set ${setting.str} to \`${parsed.arguments}\`.`);
        }
        else {
            send(message, {
                "embed": embed,
                "content": `The ${setting.str} is currently set to \`${dbData[setting.index]}\`.\n`
                    + `Set a new ${setting.str} using \`${parsed.prefix}${parsed.command} {${setting.str}}\`.\n`
                    + extraErrorLine
            });
        }
    });
}
function checkPermission(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const regex = RegExp(config_json_1.permissionsRegexp, 'i');
        return message.member.roles.cache.some(role => regex.test(role.name)) || message.member.id === message.guild.ownerID;
    });
}
client.on('message', (message) => __awaiter(void 0, void 0, void 0, function* () {
    if (message.author.bot)
        return;
    if (!channelLocks.get(message.guild.id))
        yield setupLocks(message.guild.id);
    yield channelLocks.get(message.guild.id).runExclusive(() => __awaiter(void 0, void 0, void 0, function* () {
        let dbData = yield channelDict.get(message.guild.id);
        if (!dbData) {
            dbData = defaultDBData;
            yield channelDict.set(message.guild.id, dbData);
        }
        const parsed = { prefix: dbData[1], command: null, arguments: null };
        if (message.content.startsWith(parsed.prefix)) {
            parsed.command = message.content.substring(parsed.prefix.length).split(" ")[0];
            parsed.arguments = message.content.substring(parsed.prefix.length + parsed.command.length + 1).trim();
            const hasPermission = yield checkPermission(message);
            if (hasPermission) {
                switch (parsed.command) {
                    case config_json_1.startCmd:
                        start(dbData, parsed, message);
                        break;
                    case config_json_1.displayCmd:
                        displayQueue(dbData, parsed, message);
                        break;
                    case config_json_1.queueCmd:
                        yield setQueueChannel(dbData, parsed, message);
                        break;
                    case config_json_1.nextCmd:
                        popTextQueue(dbData, parsed, message);
                        break;
                    case config_json_1.kickCmd:
                        kickMember(dbData, parsed, message);
                        break;
                    case config_json_1.clearCmd:
                        clearQueue(dbData, parsed, message);
                        break;
                    case config_json_1.shuffleCmd:
                        shuffleQueue(dbData, parsed, message);
                        break;
                    case config_json_1.gracePeriodCmd:
                        yield setServerSettings(dbData, parsed, message, true, parsed.arguments >= 0 && parsed.arguments <= 300, 'Grace period must be between `0` and `300` seconds.');
                        break;
                    case config_json_1.commandPrefixCmd:
                        yield setServerSettings(dbData, parsed, message, false, true, '');
                        break;
                    case config_json_1.colorCmd:
                        yield setServerSettings(dbData, parsed, message, true, /^#?[0-9A-F]{6}$/i.test(parsed.arguments), 'Use HEX color:', { "title": "Hex color picker", "url": "https://htmlcolorcodes.com/color-picker/", "color": dbData[2] });
                        break;
                }
            }
            else if ([config_json_1.startCmd, config_json_1.displayCmd, config_json_1.queueCmd, config_json_1.nextCmd, config_json_1.kickCmd, config_json_1.clearCmd, config_json_1.gracePeriodCmd, config_json_1.commandPrefixCmd, config_json_1.colorCmd].includes(parsed.command)) {
                message.author.send(`You don't have permission to use bot commands in \`${message.guild.name}\`. You must be assigned a \`mod\` or \`admin\` role on the server to use bot commands.`);
            }
            switch (parsed.command) {
                case config_json_1.helpCmd:
                    help(dbData, parsed, message);
                    break;
                case config_json_1.joinCmd:
                    yield joinTextChannel(dbData, parsed, message, hasPermission);
                    break;
            }
        }
        else if (message.content === config_json_1.prefix + config_json_1.helpCmd) {
            help(dbData, parsed, message);
        }
    }));
}));
client.login(config_json_1.token);
client.on('error', error => {
    console.error('The WebSocket encountered an error:', error);
});
client.once('ready', () => __awaiter(void 0, void 0, void 0, function* () {
    for (const guildIdChannelPair of yield channelDict.entries()) {
        const guild = client.guilds.cache.get(guildIdChannelPair[0]);
        if (!guild) {
            yield channelDict.delete(guildIdChannelPair[0]);
        }
        else {
            yield setupLocks(guild.id);
            const guildMemberRelease = yield guildMemberLocks.get(guild.id).acquire();
            const channelRelease = yield channelLocks.get(guild.id).acquire();
            try {
                const dbData = guildIdChannelPair[1];
                const otherData = dbData.slice(0, 10);
                const channels = yield fetchStoredChannels(dbData, guild);
                for (let i = 0; i < otherData.length; i++) {
                    otherData[i] = otherData[i] || defaultDBData[i];
                }
                guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];
                if (channels)
                    for (const channel of channels) {
                        if (channel) {
                            guildMemberDict[guild.id][channel.id] = (channel.type !== 'voice') ? [] :
                                channel.members.filter(member => !member.user.bot).map(member => {
                                    return { id: member.id, msg: null };
                                });
                        }
                        else {
                            channels.splice(channels.indexOf(channel), 1);
                        }
                    }
                yield channelDict.set(guild.id, otherData.concat(channels.map(ch => ch.id)));
            }
            finally {
                guildMemberRelease();
                channelRelease();
            }
        }
    }
    if (client && client.user)
        client.user.setPresence({ activity: { name: `${config_json_1.prefix}${config_json_1.helpCmd} for help` }, status: 'online' });
    console.log('Ready!');
}));
client.on('shardResume', () => __awaiter(void 0, void 0, void 0, function* () {
    for (const guildId of Object.keys(guildMemberDict)) {
        yield guildMemberLocks.get(guildId).runExclusive(() => __awaiter(void 0, void 0, void 0, function* () {
            const availableVoiceChannels = Object.keys(guildMemberDict[guildId]).map(id => client.channels.cache.get(id));
            for (const channel of availableVoiceChannels) {
                if (guildMemberDict[guildId][channel]) {
                    for (let i = 0; i < guildMemberDict[guildId][channel].length; i++) {
                        const memberId = guildMemberDict[guildId][channel][i];
                        if (!channel.members.has(memberId)) {
                            guildMemberDict[guildId][channel].splice(i, 1);
                            i--;
                        }
                    }
                    if (channel.members)
                        for (const member of channel.members.array()) {
                            if (!member.user.bot && !guildMemberDict[guildId][channel].includes(member.id)) {
                                guildMemberDict[guildId][channel].push({ id: member.id, msg: null });
                            }
                        }
                }
            }
        }));
    }
    if (client && client.user)
        client.user.setPresence({ activity: { name: `${config_json_1.prefix}${config_json_1.helpCmd} for help` }, status: 'online' });
    console.log('Reconnected!');
}));
client.on('voiceStateUpdate', (oldVoiceState, newVoiceState) => __awaiter(void 0, void 0, void 0, function* () {
    const oldVoiceChannel = oldVoiceState.channel;
    const newVoiceChannel = newVoiceState.channel;
    if (oldVoiceChannel !== newVoiceChannel) {
        const member = newVoiceState.member;
        const guild = newVoiceState.guild;
        if (guildMemberLocks.get(guild.id)) {
            yield guildMemberLocks.get(guild.id).runExclusive(() => __awaiter(void 0, void 0, void 0, function* () {
                guildMemberDict[guild.id] = guildMemberDict[guild.id] || [];
                const availableVoiceChannels = Object.keys(guildMemberDict[guild.id]).map(id => client.channels.cache.get(id));
                if (availableVoiceChannels.includes(newVoiceChannel) || availableVoiceChannels.includes(oldVoiceChannel)) {
                    if (member.user.bot) {
                        if (newVoiceChannel && !availableVoiceChannels.includes(newVoiceChannel)) {
                            if (guildMemberDict[guild.id][oldVoiceChannel.id].length > 0) {
                                guild.members.cache.get(guildMemberDict[guild.id][oldVoiceChannel.id][0].id).voice.setChannel(newVoiceChannel)
                                    .catch(() => null);
                            }
                            newVoiceState.setChannel(oldVoiceChannel)
                                .catch(() => null);
                        }
                    }
                    else {
                        let immediateUpdate = false;
                        if (availableVoiceChannels.includes(newVoiceChannel) && !guildMemberDict[guild.id][newVoiceChannel.id].some((queueMember) => queueMember.id === member.id)) {
                            guildMemberDict[guild.id][newVoiceChannel.id].push({ id: member.id, msg: null });
                            updateDisplayQueue(guild, [newVoiceChannel]);
                            immediateUpdate = true;
                        }
                        if (availableVoiceChannels.includes(oldVoiceChannel)) {
                            checkAfterLeaving(member, guild, oldVoiceChannel, immediateUpdate);
                        }
                    }
                }
            }));
        }
    }
}));
