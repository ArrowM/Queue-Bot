import {
   DiscordGatewayAdapterCreator,
   DiscordGatewayAdapterLibraryMethods,
   entersState,
   joinVoiceChannel,
   VoiceConnection,
   VoiceConnectionStatus,
} from "@discordjs/voice/dist";
import { Client, Constants, Guild, Snowflake, VoiceChannel, WebSocketShard } from "discord.js";
import { GatewayVoiceServerUpdateDispatchData, GatewayVoiceStateUpdateDispatchData } from "discord-api-types/v8";

export class Voice {
   /**
    * https://github.com/discordjs/voice/blob/main/examples/basic/basic-example.ts
    */

   private static connections = new Map<Snowflake, VoiceConnection>();
   private static adapters = new Map<Snowflake, DiscordGatewayAdapterLibraryMethods>();
   private static trackedClients = new Set<Client>();
   private static trackedGuilds = new Map<WebSocketShard, Set<Snowflake>>();
   /**
    * Tracks a Discord.js client, listening to VOICE_SERVER_UPDATE and VOICE_STATE_UPDATE events.
    * @param client - The Discord.js Client to track
    */
   private static trackClient(client: Client) {
      if (Voice.trackedClients.has(client)) return;
      Voice.trackedClients.add(client);
      client.ws.on(Constants.WSEvents.VOICE_SERVER_UPDATE, (payload: GatewayVoiceServerUpdateDispatchData) => {
         Voice.adapters.get(payload.guild_id)?.onVoiceServerUpdate(payload);
      });
      client.ws.on(Constants.WSEvents.VOICE_STATE_UPDATE, (payload: GatewayVoiceStateUpdateDispatchData) => {
         if (payload.guild_id && payload.session_id && payload.user_id === client.user?.id) {
            Voice.adapters.get(payload.guild_id)?.onVoiceStateUpdate(payload);
         }
      });
   }

   private static cleanupGuilds(shard: WebSocketShard) {
      const guilds = Voice.trackedGuilds.get(shard);
      if (guilds) {
         for (const guildID of guilds.values()) {
            Voice.adapters.get(guildID)?.destroy();
         }
      }
   }

   private static trackGuild(guild: Guild) {
      let guilds = Voice.trackedGuilds.get(guild.shard);
      if (!guilds) {
         const cleanup = () => Voice.cleanupGuilds(guild.shard);
         guild.shard.on("close", cleanup);
         guild.shard.on("destroyed", cleanup);
         guilds = new Set();
         Voice.trackedGuilds.set(guild.shard, guilds);
      }
      guilds.add(guild.id);
   }

   /**
    * Creates an adapter for a Voice Channel
    * @param channel - The channel to create the adapter for
    */
   private static createDiscordJSAdapter(channel: VoiceChannel): DiscordGatewayAdapterCreator {
      return (methods) => {
         Voice.adapters.set(channel.guild.id, methods);
         Voice.trackClient(channel.client);
         Voice.trackGuild(channel.guild);
         return {
            sendPayload(data) {
               if (channel.guild.shard.status === Constants.Status.READY) {
                  channel.guild.shard.send(data);
                  return true;
               }
               return false;
            },
            destroy() {
               return Voice.adapters.delete(channel.guild.id);
            },
         };
      };
   }

   public static disconnectFromChannel(channel: VoiceChannel) {
      Voice.connections.get(channel.id)?.destroy();
   }

   public static async connectToChannel(channel: VoiceChannel) {
      const connection = joinVoiceChannel({
         channelId: channel.id,
         guildId: channel.guild.id,
         adapterCreator: Voice.createDiscordJSAdapter(channel),
         selfDeaf: true,
         selfMute: true,
      });

      try {
         await entersState(connection, VoiceConnectionStatus.Ready, 30e3);
         Voice.connections.set(channel.id, connection);
         return connection;
      } catch (error) {
         connection.destroy();
         throw error;
      }
   }
}
