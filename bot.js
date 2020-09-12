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
const discord_js_1 = require("discord.js");
const async_mutex_1 = require("async-mutex");
const knex_1 = __importDefault(require("knex"));
const config_json_1 = __importDefault(require("./config.json"));
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});
require('events').EventEmitter.defaultMaxListeners = 40;
const client = new discord_js_1.Client({
    ws: { intents: ['GUILDS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES'] },
    presence: {
        activity: {
            name: `${config_json_1.default.prefix}${config_json_1.default.helpCmd} for help`
        },
        status: 'online'
    }
});
client.login(config_json_1.default.token);
client.on('error', error => console.error('The WebSocket encountered an error:', error));
const ServerSettings = {
    [config_json_1.default.gracePeriodCmd]: { dbVariable: 'grace_period', str: "grace period" },
    [config_json_1.default.prefixCmd]: { dbVariable: 'prefix', str: "prefix" },
    [config_json_1.default.colorCmd]: { dbVariable: 'color', str: "color" },
    [config_json_1.default.toggleAlwaysMessageOnUpdateCmd]: { dbVariable: 'msg_on_update', str: "always create a new display on update" }
};
Object.freeze(ServerSettings);
const knex = knex_1.default({
    client: config_json_1.default.databaseType,
    connection: {
        host: config_json_1.default.databaseHost,
        user: config_json_1.default.databaseUsername,
        password: config_json_1.default.databasePassword,
        database: config_json_1.default.databaseName
    }
});
const queueChannelsLocks = new Map();
const membersLocks = new Map();
const displayChannelsLocks = new Map();
function getLock(map, key) {
    let lock = map.get(key);
    if (!lock) {
        lock = new async_mutex_1.Mutex();
        map.set(key, lock);
    }
    return lock;
}
function sendResponse(message, messageToSend) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = message.channel;
        if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
            return message.channel.send(messageToSend)
                .catch(e => {
                console.error(e);
                return null;
            });
        }
        else {
            return message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``)
                .catch(e => {
                console.error(e);
                return null;
            });
        }
    });
}
function addStoredDisplays(queueChannel, displayChannel, embedList) {
    return __awaiter(this, void 0, void 0, function* () {
        yield getLock(displayChannelsLocks, queueChannel.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            const embedIds = [];
            for (const displayEmbed of embedList) {
                yield displayChannel.send({ embed: displayEmbed })
                    .then(msg => {
                    if (msg)
                        embedIds.push(msg.id);
                })
                    .catch(e => console.error('addStoredDisplays: ' + e));
            }
            yield knex('display_channels').insert({
                queue_channel_id: queueChannel.id,
                display_channel_id: displayChannel.id,
                embed_ids: embedIds
            });
        }));
    });
}
function removeStoredDisplays(queueChannelId, displayChannelIdToRemove) {
    return __awaiter(this, void 0, void 0, function* () {
        yield getLock(displayChannelsLocks, queueChannelId).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            let storedDisplayChannelsQuery = knex('display_channels').where('queue_channel_id', queueChannelId);
            if (displayChannelIdToRemove) {
                storedDisplayChannelsQuery = storedDisplayChannelsQuery.where('display_channel_id', displayChannelIdToRemove);
            }
            const storedDisplayChannels = yield storedDisplayChannelsQuery;
            if (!storedDisplayChannels || storedDisplayChannels.length === 0)
                return;
            for (const storedDisplayChannel of storedDisplayChannels) {
                const displayChannel = yield client.channels.fetch(storedDisplayChannel.display_channel_id).catch(() => null);
                if (!displayChannel)
                    continue;
                for (const embedId of storedDisplayChannel.embed_ids) {
                    const embed = yield displayChannel.messages.fetch(embedId).catch(() => null);
                    embed === null || embed === void 0 ? void 0 : embed.delete();
                }
            }
            yield storedDisplayChannelsQuery.del();
        }));
    });
}
function addStoredQueueMembers(queueChannelId, memberIdsToAdd, personalMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        yield getLock(membersLocks, queueChannelId).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            for (const memberId of memberIdsToAdd) {
                yield knex('queue_members').insert({
                    queue_channel_id: queueChannelId,
                    queue_member_id: memberId,
                    personal_message: personalMessage
                });
            }
        }));
    });
}
function removeStoredQueueMembers(queueChannelId, memberIdsToRemove) {
    return __awaiter(this, void 0, void 0, function* () {
        yield getLock(membersLocks, queueChannelId).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            let storedMemberQuery;
            if (memberIdsToRemove) {
                storedMemberQuery = knex('queue_members')
                    .where('queue_channel_id', queueChannelId)
                    .where('queue_member_id', 'in', memberIdsToRemove)
                    .first();
            }
            else {
                storedMemberQuery = knex('queue_members')
                    .where('queue_channel_id', queueChannelId)
                    .first();
            }
            yield storedMemberQuery.del();
        }));
    });
}
function addStoredQueueChannel(channelToAdd) {
    return __awaiter(this, void 0, void 0, function* () {
        yield getLock(queueChannelsLocks, channelToAdd.guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            yield knex('queue_channels').insert({
                queue_channel_id: channelToAdd.id,
                guild_id: channelToAdd.guild.id
            });
        }));
        if (channelToAdd.type === 'voice') {
            yield addStoredQueueMembers(channelToAdd.id, channelToAdd.members
                .filter(member => !member.user.bot).map(member => member.id));
        }
    });
}
function removeStoredQueueChannel(guildId, channelIdToRemove) {
    return __awaiter(this, void 0, void 0, function* () {
        yield getLock(queueChannelsLocks, guildId).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            if (channelIdToRemove) {
                yield knex('queue_channels').where('queue_channel_id', channelIdToRemove).first().del();
                yield removeStoredQueueMembers(channelIdToRemove);
                yield removeStoredDisplays(channelIdToRemove);
            }
            else {
                const storedQueueChannelsQuery = knex('queue_channels').where('guild_id', guildId);
                const storedQueueChannels = yield storedQueueChannelsQuery;
                for (const storedQueueChannel of storedQueueChannels) {
                    yield removeStoredQueueMembers(storedQueueChannel.queue_channel_id);
                    yield removeStoredDisplays(storedQueueChannel.queue_channel_id);
                }
                yield storedQueueChannelsQuery.del();
            }
        }));
    });
}
function fetchStoredQueueChannels(guild) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield getLock(queueChannelsLocks, guild.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            const storedQueueChannelsQuery = knex('queue_channels').where('guild_id', guild.id);
            const storedQueueChannels = yield storedQueueChannelsQuery;
            if (!storedQueueChannels)
                return null;
            const queueChannels = [];
            for (let i = storedQueueChannels.length - 1; i >= 0; i--) {
                const queueChannelId = storedQueueChannels[i].queue_channel_id;
                const queueChannel = guild.channels.cache.get(queueChannelId);
                if (queueChannel) {
                    queueChannels.push(queueChannel);
                }
                else {
                    yield removeStoredQueueChannel(guild.id, queueChannelId);
                }
            }
            return queueChannels;
        }));
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
                const graceMinutes = Math.round(+gracePeriod / 60);
                const graceSeconds = +gracePeriod % 60;
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
function generateEmbed(queueGuild, queueChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        const storedPrefix = queueGuild.prefix;
        const storedColor = queueGuild.color;
        const queueMembers = yield knex('queue_members')
            .where('queue_channel_id', queueChannel.id).orderBy('created_at');
        const embedList = [{
                "title": `${queueChannel.name} queue`,
                "color": storedColor,
                "description": queueChannel.type === 'voice' ?
                    `Join the **${queueChannel.name}** voice channel to join this queue.` + (yield getGracePeriodString(queueGuild.grace_period)) :
                    `Type \`${storedPrefix}${config_json_1.default.joinCmd} ${queueChannel.name}\` to join or leave this queue.`,
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
            const maxEmbedSize = 25;
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
                queueMembers.slice(position, sliceStop).map(queueMember => {
                    embedList[i]['fields'].push({
                        "inline": false,
                        "name": (++position).toString(),
                        "value": `<@!${queueMember.queue_member_id}>`
                            + (queueMember.personal_message ? ' -- ' + queueMember.personal_message : '')
                    });
                });
                sliceStop += maxEmbedSize;
            }
        }
        return embedList;
    });
}
function updateDisplayQueue(queueGuild, queueChannels) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const queueChannel of queueChannels) {
            if (!queueChannel)
                continue;
            const storedDisplayChannelsQuery = knex('display_channels').where('queue_channel_id', queueChannel.id);
            const storedDisplayChannels = yield storedDisplayChannelsQuery;
            if (!storedDisplayChannels || storedDisplayChannels.length === 0)
                return;
            const embedList = yield generateEmbed(queueGuild, queueChannel);
            for (const storedDisplayChannel of storedDisplayChannels) {
                const displayChannel = yield client.channels.fetch(storedDisplayChannel.display_channel_id).catch(() => null);
                if (queueGuild.msg_on_update) {
                    yield removeStoredDisplays(queueChannel.id, displayChannel.id);
                    yield addStoredDisplays(queueChannel, displayChannel, embedList);
                }
                else {
                    if (displayChannel) {
                        const storedEmbeds = [];
                        let removeEmbeds = false;
                        for (const id of storedDisplayChannel.embed_ids) {
                            const storedEmbed = yield displayChannel.messages.fetch(id).catch(() => null);
                            if (storedEmbed) {
                                storedEmbeds.push(storedEmbed);
                            }
                            else {
                                removeEmbeds = true;
                            }
                        }
                        if (removeEmbeds) {
                            yield removeStoredDisplays(queueChannel.id, displayChannel.id);
                            continue;
                        }
                        else if (storedEmbeds.length === embedList.length) {
                            for (let i = 0; i < embedList.length; i++) {
                                yield storedEmbeds[i]
                                    .edit({ embed: embedList[i] })
                                    .catch(() => null);
                            }
                        }
                        else {
                            yield removeStoredDisplays(queueChannel.id, displayChannel.id);
                            yield addStoredDisplays(queueChannel, displayChannel, embedList);
                        }
                    }
                    else if (displayChannel == undefined) {
                        yield removeStoredDisplays(queueChannel.id, displayChannel.id);
                    }
                }
            }
        }
    });
}
function extractChannel(availableChannels, parsed, message) {
    let channel = availableChannels.find(channel => { var _a; return channel.id === ((_a = message.mentions.channels.array()[0]) === null || _a === void 0 ? void 0 : _a.id); });
    if (!channel && parsed.arguments) {
        const splitArgs = parsed.arguments.split(' ');
        for (let i = splitArgs.length; i > 0; i--) {
            if (channel)
                break;
            const channelNameToCheck = splitArgs.slice(0, i).join(' ');
            channel = availableChannels.find(channel => channel.name === channelNameToCheck) ||
                availableChannels.find(channel => channel.name.localeCompare(channelNameToCheck, undefined, { sensitivity: 'accent' }) === 0);
        }
    }
    return channel;
}
function findChannel(queueGuild, availableChannels, parsed, message, includeMention, type, errorOnNoneFound) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = extractChannel(availableChannels, parsed, message);
        if (channel)
            return channel;
        if (!errorOnNoneFound)
            return;
        let response;
        if (availableChannels.length === 0) {
            response = 'No ' + (type ? `**${type}** ` : '') + 'queue channels set.'
                + '\nSet a ' + (type ? `${type} ` : '') + `queue first using \`${queueGuild.prefix}${config_json_1.default.queueCmd} {channel name}\``;
        }
        else {
            response = 'Invalid ' + (type ? `**${type}** ` : '') + `channel name! Try \`${queueGuild.prefix}${parsed.command} `;
            if (availableChannels.length === 1) {
                response += availableChannels[0].name + (includeMention ? ' @{user}' : '') + '`.';
            }
            else {
                response += '{channel name}' + (includeMention ? ' @{user}' : '') + '`.'
                    + '\nAvailable ' + (type ? `**${type}** ` : '') + `channel names: ${availableChannels.map(channel => ' `' + channel.name + '`')}`;
            }
        }
        yield sendResponse(message, response);
    });
}
function fetchChannel(queueGuild, parsed, message, includeMention, type) {
    return __awaiter(this, void 0, void 0, function* () {
        const guild = message.guild;
        const channels = yield fetchStoredQueueChannels(guild);
        if (channels.length > 0) {
            const availableChannels = type ?
                channels.filter(channel => channel.type === type) :
                channels;
            if (availableChannels.length === 1) {
                return availableChannels[0];
            }
            else {
                return yield findChannel(queueGuild, availableChannels, parsed, message, includeMention, type, true);
            }
        }
        else {
            yield sendResponse(message, `No queue channels set.`
                + `\nSet a queue first using \`${queueGuild.prefix}${config_json_1.default.queueCmd} {channel name}\``);
            return null;
        }
    });
}
function start(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = yield fetchChannel(queueGuild, parsed, message, false, 'voice');
        if (!channel)
            return;
        if (!channel.permissionsFor(message.guild.me).has('CONNECT')) {
            yield sendResponse(message, 'I need the permissions to join your voice channel!');
        }
        else if (channel.type === 'voice') {
            yield channel.join()
                .then(connection => {
                connection === null || connection === void 0 ? void 0 : connection.voice.setSelfDeaf(true);
                connection === null || connection === void 0 ? void 0 : connection.voice.setSelfMute(true);
            })
                .catch((e) => console.error('start: ' + e));
        }
        else {
            yield sendResponse(message, "I can only join voice channels.");
        }
    });
}
function displayQueue(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const queueChannel = yield fetchChannel(queueGuild, parsed, message);
        if (!queueChannel)
            return;
        const displayChannel = message.channel;
        if (displayChannel.permissionsFor(message.guild.me).has('SEND_MESSAGES')
            && displayChannel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
            const embedList = yield generateEmbed(queueGuild, queueChannel);
            yield removeStoredDisplays(queueChannel.id, displayChannel.id);
            yield addStoredDisplays(queueChannel, displayChannel, embedList);
        }
        else {
            message.author.send(`I don't have permission to write messages and embeds in \`${displayChannel.name}\``)
                .catch(e => console.error(e));
        }
    });
}
function setQueueChannel(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const parsedArgs = parsed.arguments;
        const guild = message.guild;
        const storedChannels = yield fetchStoredQueueChannels(guild);
        if (parsedArgs) {
            const channels = guild.channels.cache.filter(channel => channel.type !== 'category').array();
            const channel = yield findChannel(queueGuild, channels, parsed, message, false, null, true);
            if (!channel)
                return;
            if (storedChannels.some(storedChannel => storedChannel.id === channel.id)) {
                yield removeStoredQueueChannel(guild.id, channel.id);
                yield sendResponse(message, `Deleted queue for \`${channel.name}\`.`);
            }
            else {
                yield addStoredQueueChannel(channel);
                yield displayQueue(queueGuild, parsed, message);
            }
        }
        else {
            if (storedChannels.length > 0) {
                yield sendResponse(message, `Current queues: ${storedChannels.map(ch => ` \`${ch.name}\``)}`);
            }
            else {
                yield sendResponse(message, `No queue channels set.`
                    + `\nSet a new queue channel using \`${queueGuild.prefix}${config_json_1.default.queueCmd} {channel name}\``);
            }
        }
    });
}
function joinTextChannel(queueGuild, parsed, message, authorHasPermissionToQueueOthers) {
    return __awaiter(this, void 0, void 0, function* () {
        const queueChannel = yield fetchChannel(queueGuild, parsed, message, message.mentions.members.size > 0, 'text');
        if (!queueChannel)
            return;
        const personalMessage = parsed.arguments
            .replace(/(<(@!?|#)\w+>)/gi, '')
            .replace(queueChannel.name, '')
            .substring(0, 128)
            .trim();
        let memberIdsToToggle = [message.member.id];
        if (authorHasPermissionToQueueOthers && message.mentions.members.size > 0) {
            memberIdsToToggle = message.mentions.members.array().map(member => member.id);
        }
        const storedQueueMembers = yield knex('queue_members')
            .where('queue_channel_id', queueChannel.id);
        const memberIdsToAdd = [];
        const memberIdsToRemove = [];
        for (const memberId of memberIdsToToggle) {
            if (storedQueueMembers.some(storedMember => storedMember.queue_member_id === memberId)) {
                memberIdsToRemove.push(memberId);
            }
            else {
                memberIdsToAdd.push(memberId);
            }
        }
        let messageString = '';
        if (memberIdsToRemove.length > 0) {
            yield removeStoredQueueMembers(queueChannel.id, memberIdsToRemove);
            messageString += 'Removed ' + memberIdsToRemove.map(id => `<@!${id}>`).join(', ')
                + ` from the \`${queueChannel.name}\` queue.\n`;
        }
        if (memberIdsToAdd.length > 0) {
            yield addStoredQueueMembers(queueChannel.id, memberIdsToAdd, personalMessage);
            messageString += 'Added ' + memberIdsToAdd.map(id => `<@!${id}>`).join(', ')
                + ` to the \`${queueChannel.name}\` queue.`;
        }
        yield sendResponse(message, messageString);
        updateDisplayQueue(queueGuild, [queueChannel]);
    });
}
function popTextQueue(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const queueChannel = yield fetchChannel(queueGuild, parsed, message, false, 'text');
        if (!queueChannel)
            return;
        if (queueChannel.type !== 'text') {
            yield sendResponse(message, `\`${queueGuild.prefix}${config_json_1.default.nextCmd}\` can only be used on text channel queues.`);
        }
        else {
            const nextQueueMemberQuery = knex('queue_members').where('queue_channel_id', queueChannel.id)
                .orderBy('created_at').first();
            const nextQueueMember = yield nextQueueMemberQuery;
            if (nextQueueMember) {
                sendResponse(message, `Pulled next user (<@!${nextQueueMember.queue_member_id}>) from \`${queueChannel.name}\`.`);
                yield removeStoredQueueMembers(queueChannel.id, [nextQueueMember.queue_member_id]);
                yield updateDisplayQueue(queueGuild, [queueChannel]);
            }
            else {
                sendResponse(message, `\`${queueChannel.name}\` is empty.`);
            }
        }
    });
}
function kickMember(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        parsed.arguments = parsed.arguments.replace(/<@!?\d+>/gi, '').trim();
        const queueChannel = yield fetchChannel(queueGuild, parsed, message, message.mentions.members.size > 0, 'text');
        if (!queueChannel)
            return;
        const memberIdsToKick = message.mentions.members.array().map(member => member.id);
        if (!memberIdsToKick || memberIdsToKick.length === 0)
            return;
        let updateDisplays = false;
        yield getLock(membersLocks, queueChannel.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            const storedQueueMembersQuery = knex('queue_members')
                .where('queue_channel_id', queueChannel.id)
                .where('queue_member_id', 'in', memberIdsToKick);
            const storedQueueMemberIds = (yield storedQueueMembersQuery).map(member => member.queue_member_id);
            if (storedQueueMemberIds && storedQueueMemberIds.length > 0) {
                updateDisplays = true;
                yield storedQueueMembersQuery.del();
                yield sendResponse(message, 'Kicked ' + storedQueueMemberIds.map(id => `<@!${id}>`).join(', ')
                    + ` from the \`${queueChannel.name}\` queue.`);
            }
        }));
        if (updateDisplays)
            yield updateDisplayQueue(queueGuild, [queueChannel]);
    });
}
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
function shuffleQueue(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const queueChannel = yield fetchChannel(queueGuild, parsed, message);
        if (!queueChannel)
            return;
        yield getLock(membersLocks, queueChannel.id).runExclusive(() => __awaiter(this, void 0, void 0, function* () {
            const queueMembersQuery = knex('queue_members').where('queue_channel_id', queueChannel.id);
            const queueMembers = yield queueMembersQuery;
            const queueMemberTimeStamps = queueMembers.map(member => member.created_at);
            shuffleArray(queueMemberTimeStamps);
            for (let i = 0; i < queueMembers.length; i++) {
                yield knex('queue_members').where('id', queueMembers[i].id)
                    .update('created_at', queueMemberTimeStamps[i]);
            }
        }));
        yield updateDisplayQueue(queueGuild, [queueChannel]);
        yield sendResponse(message, `\`${queueChannel.name}\` queue shuffled.`);
    });
}
function clearQueue(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const queueChannel = yield fetchChannel(queueGuild, parsed, message);
        if (!queueChannel)
            return;
        yield removeStoredQueueMembers(queueChannel.id);
        yield updateDisplayQueue(queueGuild, [queueChannel]);
        yield sendResponse(message, `\`${queueChannel.name}\` queue cleared.`);
    });
}
function help(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const storedPrefix = queueGuild.prefix;
        const storedColor = queueGuild.color;
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
                            "value": `\`${storedPrefix}${config_json_1.default.joinCmd} {channel name} {OPTIONAL: message to display next to your name}\` joins or leaves a text channel queue.`
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
                            "value": "Available to owners or users with `queue mod`, `mod` or `admin` in their server roles."
                        },
                        {
                            "name": "Modify & View Queues",
                            "value": `\`${storedPrefix}${config_json_1.default.queueCmd} {channel name}\` creates a new queue or deletes an existing queue.`
                                + `\n\`${storedPrefix}${config_json_1.default.queueCmd}\` shows the existing queues.`
                        },
                        {
                            "name": "Display Queue Members",
                            "value": `\`${storedPrefix}${config_json_1.default.displayCmd} {channel name}\` displays the members in a queue. These messages stay updated.`
                        },
                        {
                            "name": "Pull Users from Voice Queue",
                            "value": `\`${storedPrefix}${config_json_1.default.startCmd} {channel name}\` adds the bot to a queue voice channel.`
                                + ` The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue.`
                                + ` Right-click the bot to disconnect it from the voice channel when done. See the example gif below.`
                        },
                        {
                            "name": "Pull Users from Text Queue",
                            "value": `\`${storedPrefix}${config_json_1.default.nextCmd} {channel name}\` removes the next person in the text queue and displays their name.`
                        },
                        {
                            "name": "Add Others to a Text Channel Queue",
                            "value": `\`${storedPrefix}${config_json_1.default.joinCmd} {channel name} @{user 1} @{user 2} ...\` adds other people from text channel queue.`
                        },
                        {
                            "name": "Kick Users from Queue",
                            "value": `\`${storedPrefix}${config_json_1.default.kickCmd} {channel name} @{user 1} @{user 2} ...\` kicks one or more people from a queue.`
                        },
                        {
                            "name": "Clear Queue",
                            "value": `\`${storedPrefix}${config_json_1.default.clearCmd} {channel name}\` clears a queue.`
                        },
                        {
                            "name": "Shuffle Queue",
                            "value": `\`${storedPrefix}${config_json_1.default.shuffleCmd} {channel name}\` shuffles a queue.`
                        },
                        {
                            "name": "Change the Grace Period",
                            "value": `\`${storedPrefix}${config_json_1.default.gracePeriodCmd} {time in seconds}\` changes how long a person can leave a queue before being removed.`
                        },
                        {
                            "name": "Change the Command Prefix",
                            "value": `\`${storedPrefix}${config_json_1.default.prefixCmd} {new prefix}\` changes the prefix for commands.`
                        },
                        {
                            "name": "Change the Color",
                            "value": `\`${storedPrefix}${config_json_1.default.colorCmd} {new color}\` changes the config of bot messages.`
                        },
                        {
                            "name": "Change the Display Method",
                            "value": `\`${storedPrefix}${config_json_1.default.toggleAlwaysMessageOnUpdateCmd}\` toggles whether a change to the queue will update the old display message (default), or create a new one.`
                        }
                    ]
                }
            }
        ];
        const availableChannels = message.guild.channels.cache.array();
        const channel = yield findChannel(queueGuild, availableChannels, parsed, message, false, 'text');
        if (parsed.arguments && channel) {
            if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
                embeds.forEach(em => channel.send(em)
                    .catch(e => console.error(e)));
            }
            else {
                message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``)
                    .catch(e => console.error(e));
            }
        }
        else {
            embeds.map(em => message.author.send(em)
                .catch(e => console.error(e)));
            yield sendResponse(message, "I have sent help to your PMs.");
        }
    });
}
function setServerSettings(queueGuild, parsed, message, passesValueRestrictions, extraErrorLine, embed) {
    return __awaiter(this, void 0, void 0, function* () {
        const setting = ServerSettings[parsed.command];
        const guild = message.guild;
        const channels = yield fetchStoredQueueChannels(guild);
        if (parsed.arguments && passesValueRestrictions) {
            yield knex('queue_guilds').where('guild_id', message.guild.id).first()
                .update(setting.dbVariable, parsed.arguments);
            queueGuild[setting.dbVariable] = parsed.arguments;
            yield updateDisplayQueue(queueGuild, channels);
            yield sendResponse(message, `Set \`${setting.str}\` to \`${parsed.arguments}\`.`);
        }
        else {
            yield sendResponse(message, {
                "embed": embed,
                "content": `The ${setting.str} is currently set to \`${queueGuild[setting.dbVariable]}\`.\n`
                    + `Set a new ${setting.str} using \`${queueGuild.prefix}${parsed.command} {${setting.str}}\`.\n`
                    + extraErrorLine
            });
        }
    });
}
function checkPermission(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const regex = RegExp(config_json_1.default.permissionsRegexp, 'i');
        return message.member.roles.cache.some(role => regex.test(role.name)) || message.member.id === message.guild.ownerID;
    });
}
function createDefaultGuild(guildId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield knex('queue_guilds').insert({
            guild_id: guildId,
            grace_period: '0',
            prefix: config_json_1.default.prefix,
            color: '#51ff7e',
            msg_on_update: false
        });
        return yield knex('queue_guilds').where('guild_id', guildId).first();
    });
}
client.on('message', (message) => __awaiter(void 0, void 0, void 0, function* () {
    if (message.author.bot)
        return;
    const guildId = message.guild.id;
    const queueGuild = (yield knex('queue_guilds').where('guild_id', guildId).first())
        || (yield createDefaultGuild(guildId));
    const parsed = { command: null, arguments: null };
    if (message.content.startsWith(queueGuild.prefix)) {
        parsed.command = message.content.substring(queueGuild.prefix.length).split(" ")[0];
        parsed.arguments = message.content.substring(queueGuild.prefix.length + parsed.command.length + 1).trim();
        const hasPermission = yield checkPermission(message);
        if (hasPermission) {
            switch (parsed.command) {
                case config_json_1.default.startCmd:
                    start(queueGuild, parsed, message);
                    break;
                case config_json_1.default.displayCmd:
                    displayQueue(queueGuild, parsed, message);
                    break;
                case config_json_1.default.queueCmd:
                    setQueueChannel(queueGuild, parsed, message);
                    break;
                case config_json_1.default.nextCmd:
                    popTextQueue(queueGuild, parsed, message);
                    break;
                case config_json_1.default.kickCmd:
                    kickMember(queueGuild, parsed, message);
                    break;
                case config_json_1.default.clearCmd:
                    clearQueue(queueGuild, parsed, message);
                    break;
                case config_json_1.default.shuffleCmd:
                    shuffleQueue(queueGuild, parsed, message);
                    break;
                case config_json_1.default.gracePeriodCmd:
                    setServerSettings(queueGuild, parsed, message, +parsed.arguments >= 0 && +parsed.arguments <= 300, 'Grace period must be between `0` and `300` seconds.');
                    break;
                case config_json_1.default.prefixCmd:
                    setServerSettings(queueGuild, parsed, message, true);
                    break;
                case config_json_1.default.colorCmd:
                    setServerSettings(queueGuild, parsed, message, /^#?[0-9A-F]{6}$/i.test(parsed.arguments), 'Use HEX color:', {
                        "title": "Hex color picker",
                        "url": "https://htmlcolorcodes.com/color-picker/",
                        "color": queueGuild.color
                    });
                    break;
                case config_json_1.default.toggleAlwaysMessageOnUpdateCmd:
                    parsed.arguments = String(!queueGuild.msg_on_update);
                    setServerSettings(queueGuild, parsed, message, true);
                    break;
            }
        }
        else if ([config_json_1.default.startCmd, config_json_1.default.displayCmd, config_json_1.default.queueCmd, config_json_1.default.nextCmd, config_json_1.default.kickCmd, config_json_1.default.clearCmd,
            config_json_1.default.gracePeriodCmd, config_json_1.default.prefixCmd, config_json_1.default.colorCmd].includes(parsed.command)) {
            message.author.send(`You don't have permission to use bot commands in \`${message.guild.name}\`.`
                + `You must be assigned a \`queue mod\`, \`mod\`, or \`admin\` role on the server to use bot commands.`)
                .catch(e => console.error(e));
        }
        switch (parsed.command) {
            case config_json_1.default.helpCmd:
                help(queueGuild, parsed, message);
                break;
            case config_json_1.default.joinCmd:
                joinTextChannel(queueGuild, parsed, message, hasPermission);
                break;
        }
    }
    else if (message.content === config_json_1.default.prefix + config_json_1.default.helpCmd) {
        help(queueGuild, parsed, message);
    }
}));
function resumeQueueAfterOffline() {
    return __awaiter(this, void 0, void 0, function* () {
        const storedQueueGuildsQuery = knex('queue_guilds');
        const storedQueueGuilds = yield storedQueueGuildsQuery;
        for (const storedQueueGuild of storedQueueGuilds) {
            const guild = yield client.guilds.fetch(storedQueueGuild.guild_id).catch(() => null);
            if (guild) {
                const storedQueueChannelsQuery = knex('queue_channels').where('guild_id', guild.id);
                const storedQueueChannels = yield storedQueueChannelsQuery;
                for (const storedQueueChannel of storedQueueChannels) {
                    const queueChannel = guild.channels.cache.get(storedQueueChannel.queue_channel_id);
                    if (queueChannel) {
                        if (queueChannel.type !== 'voice')
                            continue;
                        const storedQueueMembersQuery = knex('queue_members').where('queue_channel_id', queueChannel.id);
                        const storedQueueMemberIds = (yield storedQueueMembersQuery).map(member => member.queue_member_id);
                        const queueMemberIds = queueChannel.members.filter(member => !member.user.bot).keyArray();
                        for (const storedQueueMemberId of storedQueueMemberIds) {
                            if (!queueMemberIds.includes(storedQueueMemberId)) {
                                yield storedQueueMembersQuery.where('queue_member_id', storedQueueMemberId).del();
                            }
                        }
                        for (const queueMemberId of queueMemberIds) {
                            if (!storedQueueMemberIds.includes(queueMemberId)) {
                                yield storedQueueMembersQuery.insert({
                                    queue_channel_id: queueChannel.id,
                                    queue_member_id: queueMemberId
                                });
                            }
                        }
                        const storedDisplayChannelsQuery = knex('display_channels').where('queue_channel_id', queueChannel.id);
                        const storedDisplayChannels = yield storedDisplayChannelsQuery;
                        for (const storedDisplayChannel of storedDisplayChannels) {
                            const displayChannel = guild.channels.cache.get(storedDisplayChannel.display_channel_id);
                            if (displayChannel) {
                                yield updateDisplayQueue(storedQueueGuild, [queueChannel]);
                            }
                            else {
                                yield removeStoredDisplays(queueChannel.id, displayChannel.id);
                            }
                        }
                    }
                    else {
                        yield removeStoredQueueChannel(guild.id, storedQueueChannel.queue_channel_id);
                    }
                }
            }
            else if (guild == undefined) {
                yield storedQueueGuildsQuery.where('guild_id', storedQueueGuild.guild_id).del();
                yield removeStoredQueueChannel(storedQueueGuild.guild_id);
            }
        }
    });
}
client.once('ready', () => __awaiter(void 0, void 0, void 0, function* () {
    yield knex.schema.hasTable('queue_guilds').then(exists => {
        if (!exists)
            knex.schema.createTable('queue_guilds', table => {
                table.text('guild_id').primary();
                table.text('grace_period');
                table.text('prefix');
                table.text('color');
                table.boolean('msg_on_update');
            }).catch(e => console.error(e));
    });
    yield knex.schema.hasTable('queue_channels').then(exists => {
        if (!exists)
            knex.schema.createTable('queue_channels', table => {
                table.text('queue_channel_id').primary();
                table.text('guild_id');
            }).catch(e => console.error(e));
    });
    yield knex.schema.hasTable('queue_members').then(exists => {
        if (!exists)
            knex.schema.createTable('queue_members', table => {
                table.increments('id').primary();
                table.text('queue_channel_id');
                table.text('queue_member_id');
                table.text('personal_message');
                table.timestamp('created_at').defaultTo(knex.fn.now());
            }).catch(e => console.error(e));
    });
    yield knex.schema.hasTable('display_channels').then(exists => {
        if (!exists)
            knex.schema.createTable('display_channels', table => {
                table.increments('id').primary();
                table.text('queue_channel_id');
                table.text('display_channel_id');
                table.specificType('embed_ids', 'TEXT []');
            }).catch(e => console.error(e));
    });
    yield resumeQueueAfterOffline();
    console.log('Ready!');
}));
client.on('shardResume', () => __awaiter(void 0, void 0, void 0, function* () {
    yield resumeQueueAfterOffline();
    console.log('Reconnected!');
}));
const blockNextCache = new Set();
const returningMembersCache = new Map();
function markLeavingMember(member, oldVoiceChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        const storedQueueMember = yield knex('queue_members')
            .where('queue_channel_id', oldVoiceChannel.id)
            .where('queue_member_id', member.id)
            .first();
        yield removeStoredQueueMembers(oldVoiceChannel.id, [member.id]);
        returningMembersCache.set(oldVoiceChannel.id + '.' + member.id, {
            member: storedQueueMember,
            time: Date.now()
        });
    });
}
client.on('voiceStateUpdate', (oldVoiceState, newVoiceState) => __awaiter(void 0, void 0, void 0, function* () {
    const oldVoiceChannel = oldVoiceState.channel;
    const newVoiceChannel = newVoiceState.channel;
    if (oldVoiceChannel !== newVoiceChannel) {
        const member = newVoiceState.member;
        const guild = newVoiceState.guild;
        const queueGuild = yield knex('queue_guilds').where('guild_id', guild.id).first();
        const storedOldQueueChannel = oldVoiceChannel ?
            yield knex('queue_channels').where('queue_channel_id', oldVoiceChannel.id).first()
            : undefined;
        const storedNewQueueChannel = newVoiceChannel ?
            yield knex('queue_channels').where('queue_channel_id', newVoiceChannel.id).first()
            : undefined;
        if (storedOldQueueChannel && storedNewQueueChannel && !member.user.bot) {
            return;
        }
        else if (storedNewQueueChannel && !member.user.bot) {
            const recentMember = returningMembersCache.get(newVoiceChannel.id + '.' + member.id);
            const withinGracePeriod = recentMember ?
                (Date.now() - recentMember.time) < (+queueGuild.grace_period * 1000)
                : false;
            if (withinGracePeriod) {
                yield knex('queue_members').insert(recentMember.member);
            }
            else {
                yield addStoredQueueMembers(newVoiceChannel.id, [member.id]);
            }
            yield updateDisplayQueue(queueGuild, [newVoiceChannel]);
        }
        else if (storedOldQueueChannel) {
            if (member.user.bot) {
                const nextStoredQueueMember = yield knex('queue_members')
                    .where('queue_channel_id', oldVoiceChannel.id).orderBy('created_at').first();
                if (!nextStoredQueueMember)
                    return;
                const nextQueueMember = yield guild.members.fetch(nextStoredQueueMember.queue_member_id).catch(() => null);
                yield updateDisplayQueue(queueGuild, [oldVoiceChannel]);
                if (nextQueueMember) {
                    blockNextCache.add(nextQueueMember.id);
                    yield nextQueueMember.voice.setChannel(newVoiceChannel).catch(() => null);
                    yield member.voice.setChannel(oldVoiceChannel).catch(() => null);
                }
            }
            else {
                if (blockNextCache.delete(member.id)) {
                    yield removeStoredQueueMembers(oldVoiceChannel.id, [member.id]);
                }
                else {
                    yield markLeavingMember(member, oldVoiceChannel);
                }
                yield updateDisplayQueue(queueGuild, [oldVoiceChannel]);
            }
        }
    }
}));
