import { Collection, GuildBasedChannel, GuildMember, Snowflake } from "discord.js";

import { Base } from "../Base";
import { LastPulled } from "../Interfaces";

export class LastPulledTable {
  // Create & update database table if necessary
  public static async initTable() {
    await Base.knex.schema.hasTable("last_pulled").then(async (exists) => {
      if (!exists) {
        await Base.knex.schema
          .createTable("last_pulled", (table) => {
            table.increments("id").primary();
            table.bigInteger("channel_id");
            table.bigInteger("member_id");
          })
          .catch((e) => console.error(e));
      }
    });
  }

  public static async get(channelId: Snowflake) {
    return Base.knex<LastPulled>("last_pulled").where("channel_id", channelId);
  }

  public static async store(channelId: Snowflake, memberId: Snowflake) {
    await Base.knex<LastPulled>("last_pulled").insert({
      channel_id: channelId,
      member_id: memberId,
    });
  }

  public static async unstore(id: number) {
    let query = Base.knex<LastPulled>("last_pulled").where("id", id);
    await query.delete();
  }

  public static async validate(queueChannel: GuildBasedChannel, members: Collection<Snowflake, GuildMember>) {
    const storedEntries = await this.get(queueChannel.id);
    const promises = [];
    for (const entry of storedEntries) {
      const member = members.find((m) => m.id === entry.member_id);
      if (!member) {
        promises.push(LastPulledTable.unstore(entry.id));
      }
    }
    await Promise.all(promises);
  }
}
