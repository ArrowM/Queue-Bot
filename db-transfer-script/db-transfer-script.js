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
const knex_1 = __importDefault(require("knex"));
const config_json_1 = __importDefault(require("../config.json"));
const keyv = knex_1.default({
    client: config_json_1.default.databaseType,
    connection: {
        host: config_json_1.default.databaseHost,
        user: config_json_1.default.databaseUsername,
        password: config_json_1.default.databasePassword,
        database: 'mydatabase'
    }
});
const knex = knex_1.default({
    client: config_json_1.default.databaseType,
    connection: {
        host: config_json_1.default.databaseHost,
        user: config_json_1.default.databaseUsername,
        password: config_json_1.default.databasePassword,
        database: 'queue'
    }
});
function setupTables() {
    return __awaiter(this, void 0, void 0, function* () {
        yield knex.schema.hasTable('queue_guilds').then(exists => {
            if (!exists)
                knex.schema.createTable('queue_guilds', table => {
                    table.text('guild_id').primary();
                    table.text('grace_period');
                    table.text('prefix');
                    table.text('color');
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
    });
}
keyv('keyv').then((keyvEntries) => __awaiter(void 0, void 0, void 0, function* () {
    yield setupTables();
    for (const keyvEntry of keyvEntries) {
        const guildId = keyvEntry.key.replace('keyv:', '');
        const pair = JSON.parse(keyvEntry.value);
        const storedQueueGuild = yield knex('queue_guilds')
            .where('guild_id', guildId)
            .first();
        if (!storedQueueGuild) {
            yield knex('queue_guilds').insert({
                guild_id: guildId,
                grace_period: pair.value[0],
                prefix: pair.value[1],
                color: pair.value[2]
            });
        }
        for (const queueChannelId of pair.value.slice(10)) {
            const storedQueueChannel = yield knex('queue_channels')
                .where('guild_id', guildId)
                .where('queue_channel_id', queueChannelId)
                .first();
            if (!storedQueueChannel) {
                yield knex('queue_channels').insert({
                    queue_channel_id: queueChannelId,
                    guild_id: guildId
                });
            }
        }
    }
    console.log('Complete');
    process.exit();
}));
