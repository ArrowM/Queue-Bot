/* eslint-disable @typescript-eslint/camelcase */
import Knex from 'knex';
import config from "../config.json";

// Connect DBs
const keyv = Knex({
	client: config.databaseType,
	connection: {
		host: config.databaseHost,
		user: config.databaseUsername,
		password: config.databasePassword,
		database: config.databaseName
	}
});

const knex = Knex({
	client: config.databaseType,
	connection: {
		host: config.databaseHost,
		user: config.databaseUsername,
		password: config.databasePassword,
		database: 'queue'
	}
});

interface KeyvTable {
	key: string;
	value: string;
}

interface KeyvPair {
	value: string[];
	expires: string;
}

interface QueueGuild {
	guild_id: string; // KEY
	grace_period: string;
	prefix: string;
	color: string;
}

interface QueueChannel {
	queue_channel_id: string; // KEY
	guild_id: string;
}

// Setup new DB
knex.schema.hasTable('queue_guilds').then(exists => {
	if (!exists) knex.schema.createTable('queue_guilds', table => {
		table.text('guild_id').primary();
		table.text('grace_period');
		table.text('prefix');
		table.text('color');
	}).catch(e => console.error(e));
});
knex.schema.hasTable('queue_channels').then(exists => {
	if (!exists) knex.schema.createTable('queue_channels', table => {
		table.text('queue_channel_id').primary();
		table.text('guild_id');
	}).catch(e => console.error(e));
});
knex.schema.hasTable('queue_members').then(exists => {
	if (!exists) knex.schema.createTable('queue_members', table => {
		table.increments('id').primary();
		table.text('queue_channel_id');
		table.text('queue_member_id');
		table.text('personal_message');
		table.timestamp('created_at').defaultTo(knex.fn.now());
	}).catch(e => console.error(e));
});
knex.schema.hasTable('display_channels').then(exists => {
	if (!exists) knex.schema.createTable('display_channels', table => {
		table.increments('id').primary();
		table.text('queue_channel_id');
		table.text('display_channel_id');
		table.specificType('embed_ids', 'TEXT []');
	}).catch(e => console.error(e));
});

// Import Old DB
keyv<KeyvTable>('keyv').then(async keyvEntries => {
	for (const keyvEntry of keyvEntries) {

		const guildId = keyvEntry.key.replace('keyv:', '');
		const pair: KeyvPair = JSON.parse(keyvEntry.value);

		const storedQueueGuild = await knex<QueueGuild>('queue_guilds')
			.where('guild_id', guildId);

		if (!storedQueueGuild) {
			await knex<QueueGuild>('queue_guilds').insert({
				guild_id: guildId,
				grace_period: pair.value[0],
				prefix: pair.value[1],
				color: pair.value[2]
			});
        }
		
		for (const queueChannelId of pair.value.slice(10)) {
			
			const storedQueueChannel = await knex<QueueChannel>('queue_channels')
				.where('guild_id', guildId).where('queue_channel_id', queueChannelId);

			if (!storedQueueChannel) {
				await knex<QueueChannel>('queue_channels').insert({
					queue_channel_id: queueChannelId,
					guild_id: guildId
				});
            }
		}
	}
	console.log('Complete')
	process.exit();
})
