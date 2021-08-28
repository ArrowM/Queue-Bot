import {
   DiscordGatewayAdapterCreator,
   DiscordGatewayAdapterLibraryMethods,
   entersState,
   joinVoiceChannel,
   VoiceConnection,
   VoiceConnectionStatus,
} from "@discordjs/voice/dist";
import { Client, Constants, Guild, Snowflake, StageChannel, VoiceChannel } from "discord.js";
import { GatewayVoiceServerUpdateDispatchData, GatewayVoiceStateUpdateDispatchData } from "discord-api-types/v9";

export class Voice {
   /**
    * https://github.com/discordjs/voice/blob/main/examples/basic/basic-example.ts
    */
   private static connections = new Map<Snowflake, VoiceConnection>();
   private static adapters = new Map<Snowflake, DiscordGatewayAdapterLibraryMethods>();
   private static trackedShards = new Map<number, Set<Snowflake>>();
   private static trackedClients = new Set<Client>();

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
      client.on(Constants.Events.SHARD_DISCONNECT, (_, shardID) => {
         const guilds = Voice.trackedShards.get(shardID);
         if (guilds) {
            for (const guildId of guilds.values()) {
               Voice.adapters.get(guildId)?.destroy();
            }
         }
         Voice.trackedShards.delete(shardID);
      });
   }

   private static trackGuild(guild: Guild) {
      let guilds = Voice.trackedShards.get(guild.shardId);
      if (!guilds) {
         guilds = new Set();
         Voice.trackedShards.set(guild.shardId, guilds);
      }
      guilds.add(guild.id);
   }

   /**
    * Creates an adapter for a Voice Channel
    * @param channel - The channel to create the adapter for
    */
   public static createDiscordJSAdapter(channel: VoiceChannel | StageChannel): DiscordGatewayAdapterCreator {
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

   public static disconnectFromChannel(channel: VoiceChannel | StageChannel): void {
      Voice.connections.get(channel.id)?.destroy();
   }

   public static async connectToChannel(channel: VoiceChannel | StageChannel): Promise<VoiceConnection> {
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
