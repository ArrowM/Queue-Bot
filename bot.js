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
const knex_1 = __importDefault(require("knex"));
const config_json_1 = __importDefault(require("./config.json"));
const dblapi_js_1 = __importDefault(require("dblapi.js"));
require('events').EventEmitter.defaultMaxListeners = 0;
const client = new discord_js_1.Client({
    ws: { intents: ['GUILDS', 'GUILD_VOICE_STATES', 'GUILD_MESSAGES'] },
    presence: {
        activity: {
            name: `${config_json_1.default.prefix}${config_json_1.default.helpCmd} for help`
        },
        status: 'online'
    },
    messageEditHistoryMaxSize: 0,
    messageCacheMaxSize: 5,
    messageCacheLifetime: 3 * 3600,
    messageSweepInterval: 3600,
    restWsBridgeTimeout: 10000,
});
client.login(config_json_1.default.token);
if (config_json_1.default.topGgToken) {
    const dbl = new dblapi_js_1.default(config_json_1.default.topGgToken, client);
    dbl.on('error', () => null);
}
const ServerSettings = {
    [config_json_1.default.gracePeriodCmd]: { dbVariable: 'grace_period', str: 'grace period' },
    [config_json_1.default.prefixCmd]: { dbVariable: 'prefix', str: 'prefix' },
    [config_json_1.default.colorCmd]: { dbVariable: 'color', str: 'color' },
    [config_json_1.default.modeCmd]: { dbVariable: 'msg_mode', str: 'message mode' }
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
function sendResponse(message, messageToSend) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = message.channel;
        if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
            return message.channel.send(messageToSend)
                .catch(() => null);
        }
        else {
            return message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``)
                .catch(() => null);
        }
    });
}
function addStoredDisplays(queueChannel, displayChannel, msgEmbed) {
    return __awaiter(this, void 0, void 0, function* () {
        let embedId;
        yield displayChannel.send({ embed: msgEmbed })
            .then(msg => { if (msg)
            embedId = msg.id; })
            .catch(() => null);
        yield knex('display_channels')
            .insert({
            queue_channel_id: queueChannel.id,
            display_channel_id: displayChannel.id,
            embed_id: embedId
        });
    });
}
function removeStoredDisplays(queueChannelId, displayChannelIdToRemove, deleteOldDisplayMsg = true) {
    return __awaiter(this, void 0, void 0, function* () {
        let storedDisplayChannels;
        if (displayChannelIdToRemove) {
            storedDisplayChannels = yield knex('display_channels')
                .where('queue_channel_id', queueChannelId)
                .where('display_channel_id', displayChannelIdToRemove);
            yield knex('display_channels')
                .where('queue_channel_id', queueChannelId)
                .where('display_channel_id', displayChannelIdToRemove)
                .del();
        }
        else {
            storedDisplayChannels = yield knex('display_channels')
                .where('queue_channel_id', queueChannelId);
            yield knex('display_channels')
                .where('queue_channel_id', queueChannelId)
                .del();
        }
        if (!storedDisplayChannels || !deleteOldDisplayMsg)
            return;
        for (const storedDisplayChannel of storedDisplayChannels) {
            const displayChannel = yield client.channels.fetch(storedDisplayChannel.display_channel_id).catch(() => null);
            if (!displayChannel)
                continue;
            yield displayChannel.messages.fetch(storedDisplayChannel.embed_id, false)
                .then(embed => embed === null || embed === void 0 ? void 0 : embed.delete())
                .catch(() => null);
        }
    });
}
function addStoredQueueMembers(queueChannelId, memberIdsToAdd, personalMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const memberId of memberIdsToAdd) {
            yield knex('queue_members')
                .insert({
                queue_channel_id: queueChannelId,
                queue_member_id: memberId,
                personal_message: personalMessage
            });
        }
    });
}
function removeStoredQueueMembers(queueChannelId, memberIdsToRemove) {
    return __awaiter(this, void 0, void 0, function* () {
        if (memberIdsToRemove) {
            yield knex('queue_members')
                .where('queue_channel_id', queueChannelId)
                .whereIn('queue_member_id', memberIdsToRemove)
                .first()
                .del();
        }
        else {
            yield knex('queue_members')
                .where('queue_channel_id', queueChannelId)
                .first()
                .del();
        }
    });
}
function addStoredQueueChannel(channelToAdd) {
    return __awaiter(this, void 0, void 0, function* () {
        yield knex('queue_channels')
            .insert({
            queue_channel_id: channelToAdd.id,
            guild_id: channelToAdd.guild.id
        }).catch(() => null);
        if (channelToAdd.type === 'voice') {
            yield addStoredQueueMembers(channelToAdd.id, channelToAdd.members
                .filter(member => !member.user.bot).map(member => member.id));
        }
    });
}
function removeStoredQueueChannel(guildId, channelIdToRemove) {
    return __awaiter(this, void 0, void 0, function* () {
        if (channelIdToRemove) {
            yield knex('queue_channels')
                .where('queue_channel_id', channelIdToRemove)
                .first()
                .del();
            yield removeStoredQueueMembers(channelIdToRemove);
            yield removeStoredDisplays(channelIdToRemove);
        }
        else {
            const storedQueueChannels = yield knex('queue_channels')
                .where('guild_id', guildId);
            for (const storedQueueChannel of storedQueueChannels) {
                yield removeStoredQueueMembers(storedQueueChannel.queue_channel_id);
                yield removeStoredDisplays(storedQueueChannel.queue_channel_id);
            }
            yield knex('queue_channels')
                .where('guild_id', guildId)
                .del();
        }
    });
}
function fetchStoredQueueChannels(guild) {
    return __awaiter(this, void 0, void 0, function* () {
        const queueChannelIdsToRemove = [];
        const storedQueueChannels = yield knex('queue_channels')
            .where('guild_id', guild.id);
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
                queueChannelIdsToRemove.push(queueChannelId);
            }
        }
        for (const queueChannelId of queueChannelIdsToRemove) {
            yield removeStoredQueueChannel(guild.id, queueChannelId);
        }
        return queueChannels;
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
                result = ` If you leave, you have ${timeString} to rejoin to reclaim your spot.`;
            }
            gracePeriodCache.set(gracePeriod, result);
        }
        return gracePeriodCache.get(gracePeriod);
    });
}
function generateEmbed(queueGuild, queueChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        const queueMembers = yield knex('queue_members')
            .where('queue_channel_id', queueChannel.id).orderBy('created_at');
        const embed = new discord_js_1.MessageEmbed();
        embed.setTitle(queueChannel.name);
        embed.setColor(queueGuild.color);
        embed.setDescription(queueChannel.type === 'voice' ?
            `Join the **${queueChannel.name}** voice channel to join this queue.` + (yield getGracePeriodString(queueGuild.grace_period)) :
            `Type \`${queueGuild.prefix}${config_json_1.default.joinCmd} ${queueChannel.name}\` to join or leave this queue.`);
        if (!queueMembers || queueMembers.length === 0) {
            embed.addField('No members in queue.', '\u200b');
        }
        else if (queueMembers.length > 625) {
            embed.addField('Max size of 625 users reached.', 'Contact the support server: https://discord.gg/RbmfnP3');
        }
        else {
            const maxEmbedSize = 25;
            let position = 0;
            for (let i = 0; i < queueMembers.length / maxEmbedSize; i++) {
                embed.addField('\u200b', queueMembers
                    .slice(position, position + maxEmbedSize)
                    .reduce((accumlator, queueMember) => accumlator = accumlator +
                    `${++position} <@!${queueMember.queue_member_id}>`
                    + (queueMember.personal_message ? ' -- ' + queueMember.personal_message : '') + '\n', ''));
            }
            embed.fields[0].name = `Queue length: **${queueMembers ? queueMembers.length : 0}**`;
        }
        return embed;
    });
}
function updateDisplayQueue(queueGuild, queueChannels) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const queueChannel of queueChannels) {
            if (!queueChannel)
                continue;
            const storedDisplayChannels = yield knex('display_channels')
                .where('queue_channel_id', queueChannel.id);
            if (!storedDisplayChannels || storedDisplayChannels.length === 0)
                return;
            const msgEmbed = yield generateEmbed(queueGuild, queueChannel);
            for (const storedDisplayChannel of storedDisplayChannels) {
                try {
                    const displayChannel = yield client.channels.fetch(storedDisplayChannel.display_channel_id);
                    if (displayChannel) {
                        if (displayChannel.permissionsFor(displayChannel.guild.me).has('SEND_MESSAGES') &&
                            displayChannel.permissionsFor(displayChannel.guild.me).has('EMBED_LINKS')) {
                            if (queueGuild.msg_mode === 1) {
                                const storedEmbed = yield displayChannel.messages.fetch(storedDisplayChannel.embed_id).catch(() => null);
                                if (storedEmbed) {
                                    yield storedEmbed.edit({ embed: msgEmbed }).catch(() => null);
                                }
                                else {
                                    yield addStoredDisplays(queueChannel, displayChannel, msgEmbed);
                                }
                            }
                            else {
                                yield removeStoredDisplays(queueChannel.id, displayChannel.id, queueGuild.msg_mode === 2);
                                yield addStoredDisplays(queueChannel, displayChannel, msgEmbed);
                            }
                        }
                    }
                    else {
                        yield removeStoredDisplays(queueChannel.id, storedDisplayChannel.display_channel_id);
                    }
                }
                catch (e) {
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
                + '\nSet a ' + (type ? `${type} ` : '') + `queue first using \`${queueGuild.prefix}${config_json_1.default.queueCmd} {channel name}\`.`;
        }
        else {
            response = 'Invalid ' + (type ? `**${type}** ` : '') + `channel name. Try \`${queueGuild.prefix}${parsed.command} `;
            if (availableChannels.length === 1) {
                response += availableChannels[0].name + (includeMention ? ' @{user}' : '') + '`.';
            }
            else {
                response += '{channel name}' + (includeMention ? ' @{user}' : '') + '`.'
                    + '\nAvailable ' + (type ? `**${type}** ` : '') + `channel names: ${availableChannels.map(channel => ' `' + channel.name + '`')}.`;
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
                + `\nSet a queue first using \`${queueGuild.prefix}${config_json_1.default.queueCmd} {channel name}\`.`);
            return null;
        }
    });
}
function start(queueGuild, parsed, message) {
    return __awaiter(this, void 0, void 0, function* () {
        const channel = yield fetchChannel(queueGuild, parsed, message, false, 'voice');
        if (!channel)
            return;
        if (channel.permissionsFor(message.guild.me).has('CONNECT')) {
            if (channel.type === 'voice') {
                try {
                    channel.join().then(connection => {
                        var _a, _b;
                        if (connection) {
                            connection.on('error', () => null);
                            connection.on('failed', () => null);
                            (_a = connection.voice) === null || _a === void 0 ? void 0 : _a.setSelfDeaf(true);
                            (_b = connection.voice) === null || _b === void 0 ? void 0 : _b.setSelfMute(true);
                        }
                    });
                }
                catch (e) {
                }
            }
            else {
                yield sendResponse(message, 'I can only join voice channels.');
            }
        }
        else {
            yield sendResponse(message, 'I need the permissions to join your voice channel!');
        }
    });
}
function displayQueue(queueGuild, parsed, message, queueChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        queueChannel = queueChannel || (yield fetchChannel(queueGuild, parsed, message));
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
            message.author.send(`I don't have permission to write messages and embeds in \`${displayChannel.name}\`.`)
                .catch(() => null);
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
            const queueChannel = yield findChannel(queueGuild, channels, parsed, message, false, null, true);
            if (!queueChannel)
                return;
            if (storedChannels.some(storedChannel => storedChannel.id === queueChannel.id)) {
                yield removeStoredQueueChannel(guild.id, queueChannel.id);
                yield sendResponse(message, `Deleted queue for \`${queueChannel.name}\`.`);
            }
            else {
                yield addStoredQueueChannel(queueChannel);
                yield displayQueue(queueGuild, parsed, message, queueChannel);
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
            const nextQueueMember = yield knex('queue_members')
                .where('queue_channel_id', queueChannel.id)
                .orderBy('created_at')
                .first();
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
        const storedQueueMemberIds = yield knex('queue_members')
            .where('queue_channel_id', queueChannel.id)
            .whereIn('queue_member_id', memberIdsToKick)
            .pluck('queue_member_id');
        if (storedQueueMemberIds && storedQueueMemberIds.length > 0) {
            updateDisplays = true;
            yield knex('queue_members')
                .where('queue_channel_id', queueChannel.id)
                .whereIn('queue_member_id', memberIdsToKick)
                .del();
            yield sendResponse(message, 'Kicked ' + storedQueueMemberIds.map(id => `<@!${id}>`).join(', ')
                + ` from the \`${queueChannel.name}\` queue.`);
        }
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
        const queueMembers = yield knex('queue_members')
            .where('queue_channel_id', queueChannel.id);
        const queueMemberTimeStamps = queueMembers.map(member => member.created_at);
        shuffleArray(queueMemberTimeStamps);
        for (let i = 0; i < queueMembers.length; i++) {
            yield knex('queue_members')
                .where('id', queueMembers[i].id)
                .update('created_at', queueMemberTimeStamps[i]);
        }
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
                'embed': {
                    'title': 'Non-Restricted Commands',
                    'color': storedColor,
                    'author': {
                        'name': 'Queue Bot',
                        'url': 'https://top.gg/bot/679018301543677959',
                        'iconUrl': 'https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/icon.png'
                    },
                    'fields': [
                        {
                            'name': 'Access',
                            'value': 'Available to everyone.'
                        },
                        {
                            'name': 'Join a Text Channel Queue',
                            'value': `\`${storedPrefix}${config_json_1.default.joinCmd} {channel name} {OPTIONAL: message to display next to your name}\` joins or leaves a text channel queue.`
                        }
                    ]
                }
            },
            {
                'embed': {
                    'title': 'Restricted Commands',
                    'color': storedColor,
                    'image': {
                        'url': 'https://raw.githubusercontent.com/ArrowM/Queue-Bot/master/docs/example.gif'
                    },
                    'fields': [
                        {
                            'name': 'Access',
                            'value': 'Available to owners or users with `queue mod`, `mod` or `admin` in their server roles.'
                        },
                        {
                            'name': 'Modify & View Queues',
                            'value': `\`${storedPrefix}${config_json_1.default.queueCmd} {channel name}\` creates a new queue or deletes an existing queue.`
                                + `\n\`${storedPrefix}${config_json_1.default.queueCmd}\` shows the existing queues.`
                        },
                        {
                            'name': 'Display Queue Members',
                            'value': `\`${storedPrefix}${config_json_1.default.displayCmd} {channel name}\` displays the members in a queue. These messages stay updated.`
                        },
                        {
                            'name': 'Pull Users from Voice Queue',
                            'value': `\`${storedPrefix}${config_json_1.default.startCmd} {channel name}\` adds the bot to a queue voice channel.`
                                + ` The bot can be pulled into a non-queue channel to automatically swap with person at the front of the queue.`
                                + ` Right-click the bot to disconnect it from the voice channel when done. See the example gif below.`
                        },
                        {
                            'name': 'Pull Users from Text Queue',
                            'value': `\`${storedPrefix}${config_json_1.default.nextCmd} {channel name}\` removes the next person in the text queue and displays their name.`
                        },
                        {
                            'name': 'Add Others to a Text Channel Queue',
                            'value': `\`${storedPrefix}${config_json_1.default.joinCmd} {channel name} @{user 1} @{user 2} ...\` adds other people from text channel queue.`
                        },
                        {
                            'name': 'Kick Users from Queue',
                            'value': `\`${storedPrefix}${config_json_1.default.kickCmd} {channel name} @{user 1} @{user 2} ...\` kicks one or more people from a queue.`
                        },
                        {
                            'name': 'Clear Queue',
                            'value': `\`${storedPrefix}${config_json_1.default.clearCmd} {channel name}\` clears a queue.`
                        },
                        {
                            'name': 'Shuffle Queue',
                            'value': `\`${storedPrefix}${config_json_1.default.shuffleCmd} {channel name}\` shuffles a queue.`
                        },
                        {
                            'name': 'Change the Grace Period',
                            'value': `\`${storedPrefix}${config_json_1.default.gracePeriodCmd} {time in seconds}\` changes how long a person can leave a queue before being removed.`
                        },
                        {
                            'name': 'Change the Command Prefix',
                            'value': `\`${storedPrefix}${config_json_1.default.prefixCmd} {new prefix}\` changes the prefix for commands.`
                        },
                        {
                            'name': 'Change the Color',
                            'value': `\`${storedPrefix}${config_json_1.default.colorCmd} {new color}\` changes the color of bot messages.`
                        },
                        {
                            'name': 'Change the Display Mode',
                            'value': `\`${storedPrefix}${config_json_1.default.modeCmd} {new mode}\` changes how the display messages are updated.`
                                + `\n\`${storedPrefix}${config_json_1.default.modeCmd}\` displays the different update modes.`
                        }
                    ]
                }
            }
        ];
        const availableChannels = message.guild.channels.cache.array();
        const channel = yield findChannel(queueGuild, availableChannels, parsed, message, false, 'text');
        if (parsed.arguments && channel) {
            if (channel.permissionsFor(message.guild.me).has('SEND_MESSAGES') && channel.permissionsFor(message.guild.me).has('EMBED_LINKS')) {
                embeds.forEach(em => channel.send(em).catch(() => null));
            }
            else {
                message.author.send(`I don't have permission to write messages and embeds in \`${channel.name}\``)
                    .catch(() => null);
            }
        }
        else {
            embeds.map(em => {
                message.author.send(em).catch(() => null);
            });
            yield sendResponse(message, 'I have sent help to your PMs.');
        }
    });
}
function setServerSettings(queueGuild, parsed, message, passesValueRestrictions, extraErrorLine, embed) {
    return __awaiter(this, void 0, void 0, function* () {
        const setting = ServerSettings[parsed.command];
        const guild = message.guild;
        const channels = yield fetchStoredQueueChannels(guild);
        if (parsed.arguments && passesValueRestrictions) {
            yield knex('queue_guilds')
                .where('guild_id', message.guild.id)
                .first()
                .update(setting.dbVariable, parsed.arguments);
            queueGuild[setting.dbVariable] = parsed.arguments;
            yield updateDisplayQueue(queueGuild, channels);
            yield sendResponse(message, `Set \`${setting.str}\` to \`${parsed.arguments}\`.`);
        }
        else {
            yield sendResponse(message, {
                'embed': embed,
                'content': `The ${setting.str} is currently set to \`${queueGuild[setting.dbVariable]}\`.\n`
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
            msg_mode: 1
        }).catch(() => null);
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
        parsed.command = message.content.substring(queueGuild.prefix.length).split(' ')[0];
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
                    setServerSettings(queueGuild, parsed, message, +parsed.arguments >= 0 && +parsed.arguments <= 6000, 'Grace period must be between `0` and `6000` seconds.');
                    break;
                case config_json_1.default.prefixCmd:
                    setServerSettings(queueGuild, parsed, message, true);
                    break;
                case config_json_1.default.colorCmd:
                    setServerSettings(queueGuild, parsed, message, /^#?[0-9A-F]{6}$/i.test(parsed.arguments), 'Use HEX color:', {
                        'title': 'Hex color picker',
                        'url': 'https://htmlcolorcodes.com/color-picker/',
                        'color': queueGuild.color
                    });
                    break;
                case config_json_1.default.modeCmd:
                    setServerSettings(queueGuild, parsed, message, +parsed.arguments >= 1 && +parsed.arguments <= 3, 'When the queue changes: \n' +
                        '`1`: (default) Update old display message \n' +
                        '`2`: Send a new display message and delete the old one. \n' +
                        '`3`: Send a new display message.');
                    break;
            }
        }
        else if ([config_json_1.default.startCmd, config_json_1.default.displayCmd, config_json_1.default.queueCmd, config_json_1.default.nextCmd, config_json_1.default.kickCmd, config_json_1.default.clearCmd,
            config_json_1.default.gracePeriodCmd, config_json_1.default.prefixCmd, config_json_1.default.colorCmd].includes(parsed.command)) {
            message.author.send(`You don't have permission to use bot commands in \`${message.guild.name}\`.`
                + `You must be assigned a \`queue mod\`, \`mod\`, or \`admin\` role on the server to use bot commands.`)
                .catch(() => null);
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
        const storedQueueGuilds = yield knex('queue_guilds');
        for (const storedQueueGuild of storedQueueGuilds) {
            try {
                const guild = yield client.guilds.fetch(storedQueueGuild.guild_id);
                const storedQueueChannels = yield knex('queue_channels')
                    .where('guild_id', guild.id);
                for (const storedQueueChannel of storedQueueChannels) {
                    const queueChannel = guild.channels.cache.get(storedQueueChannel.queue_channel_id);
                    if (queueChannel) {
                        if (queueChannel.type !== 'voice')
                            continue;
                        let updateDisplay = false;
                        const storedQueueMemberIds = yield knex('queue_members')
                            .where('queue_channel_id', queueChannel.id)
                            .pluck('queue_member_id');
                        const queueMemberIds = queueChannel.members.filter(member => !member.user.bot).keyArray();
                        for (const storedQueueMemberId of storedQueueMemberIds) {
                            if (!queueMemberIds.includes(storedQueueMemberId)) {
                                updateDisplay = true;
                                yield knex('queue_members')
                                    .where('queue_channel_id', queueChannel.id)
                                    .where('queue_member_id', storedQueueMemberId)
                                    .del();
                            }
                        }
                        for (const queueMemberId of queueMemberIds) {
                            if (!storedQueueMemberIds.includes(queueMemberId)) {
                                updateDisplay = true;
                                yield knex('queue_members')
                                    .where('queue_channel_id', queueChannel.id)
                                    .insert({
                                    queue_channel_id: queueChannel.id,
                                    queue_member_id: queueMemberId
                                });
                            }
                        }
                        if (updateDisplay) {
                            yield updateDisplayQueue(storedQueueGuild, [queueChannel]);
                        }
                    }
                    else {
                        yield removeStoredQueueChannel(guild.id, storedQueueChannel.queue_channel_id);
                    }
                }
            }
            catch (e) {
                if ((e === null || e === void 0 ? void 0 : e.code) === 50001) {
                    console.log('Deleting Guild ' + storedQueueGuild.guild_id);
                    yield removeStoredQueueChannel(storedQueueGuild.guild_id);
                    yield knex('queue_guilds')
                        .where('guild_id', storedQueueGuild.guild_id)
                        .del();
                }
                else {
                    console.error(e);
                }
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
                table.integer('msg_mode');
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
                table.text('embed_id');
            }).catch(e => console.error(e));
    });
    if (yield knex.schema.hasColumn('queue_guilds', 'msg_on_update')) {
        console.log('Migrating message mode');
        yield knex.schema.table('queue_guilds', table => table.integer('msg_mode'));
        (yield knex('queue_guilds')).forEach((queueGuild) => __awaiter(void 0, void 0, void 0, function* () {
            yield knex('queue_guilds').where('guild_id', queueGuild.guild_id)
                .update('msg_mode', queueGuild['msg_on_update'] ? 2 : 1);
        }));
        yield knex.schema.table('queue_guilds', table => table.dropColumn('msg_on_update'));
    }
    if (yield knex.schema.hasColumn('display_channels', 'embed_ids')) {
        console.log('Migrating display embed ids');
        yield knex.schema.table('display_channels', table => table.text('embed_id'));
        (yield knex('display_channels')).forEach((displayChannel) => __awaiter(void 0, void 0, void 0, function* () {
            yield knex('display_channels')
                .where('display_channel_id', displayChannel.display_channel_id)
                .where('queue_channel_id', displayChannel.queue_channel_id)
                .update('embed_id', displayChannel['embed_ids'][0]);
        }));
        yield knex.schema.table('display_channels', table => table.dropColumn('embed_ids'));
    }
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
    const oldVoiceChannel = oldVoiceState === null || oldVoiceState === void 0 ? void 0 : oldVoiceState.channel;
    const newVoiceChannel = newVoiceState === null || newVoiceState === void 0 ? void 0 : newVoiceState.channel;
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
        const channelsToUpdate = [];
        if (storedOldQueueChannel && storedNewQueueChannel && member.user.bot) {
            return;
        }
        if (storedNewQueueChannel && !member.user.bot) {
            const recentMember = returningMembersCache.get(newVoiceChannel.id + '.' + member.id);
            returningMembersCache.delete(newVoiceChannel.id + '.' + member.id);
            const withinGracePeriod = recentMember ?
                (Date.now() - recentMember.time) < (+queueGuild.grace_period * 1000)
                : false;
            if (withinGracePeriod) {
                yield knex('queue_members').insert(recentMember.member);
            }
            else {
                yield addStoredQueueMembers(newVoiceChannel.id, [member.id]);
            }
            channelsToUpdate.push(newVoiceChannel);
        }
        if (storedOldQueueChannel) {
            if (member.user.bot && newVoiceChannel) {
                const nextStoredQueueMember = yield knex('queue_members')
                    .where('queue_channel_id', oldVoiceChannel.id).orderBy('created_at').first();
                if (!nextStoredQueueMember)
                    return;
                const nextQueueMember = yield guild.members.fetch(nextStoredQueueMember.queue_member_id).catch(() => null);
                if (nextQueueMember) {
                    blockNextCache.add(nextQueueMember.id);
                    nextQueueMember.voice.setChannel(newVoiceChannel).catch(() => null);
                    member.voice.setChannel(oldVoiceChannel).catch(() => null);
                }
            }
            else {
                if (blockNextCache.delete(member.id)) {
                    yield removeStoredQueueMembers(oldVoiceChannel.id, [member.id]);
                }
                else {
                    yield markLeavingMember(member, oldVoiceChannel);
                }
            }
            channelsToUpdate.push(oldVoiceChannel);
        }
        if (channelsToUpdate.length > 0) {
            updateDisplayQueue(queueGuild, channelsToUpdate);
        }
    }
}));
