import { QueueGuild } from "../../Interfaces";
import { DatabaseTable } from "./DatabaseTable";

export class QueueGuildTable extends DatabaseTable {
    /**
     * Migration of msg_on_update to msg_mode
     */
    private async addMsgMode(): Promise<void> {
        if (await this.knex.schema.hasColumn('queue_guilds', 'msg_on_update')) {
            console.log('Migrating message mode');
            await this.knex.schema.table('queue_guilds', table => table.integer('msg_mode'));
            (await this.knex<QueueGuild>('queue_guilds')).forEach(async queueGuild => {
                await this.knex<QueueGuild>('queue_guilds').where('guild_id', queueGuild.guild_id)
                    .update('msg_mode', queueGuild['msg_on_update'] ? 2 : 1);
            });
            await this.knex.schema.table('queue_guilds', table => table.dropColumn('msg_on_update'));
        }
    }

    /**
     * Modify the database structure for code patches
     */
    protected async updateTableStructure(): Promise<void> {
        await this.addMsgMode();
    }

    /**
     * Create & update QueueGuild database table if necessary
     */
    public async initTable(): Promise<void> {
        await this.knex.schema.hasTable('queue_guilds').then(async exists => {
            if (!exists) await this.knex.schema.createTable('queue_guilds', table => {
                table.text('guild_id').primary();
                table.text('grace_period');
                table.text('prefix');
                table.text('color');
                table.integer('msg_mode');
            }).catch(e => console.error(e));
        });

        await this.updateTableStructure();
    }
}


