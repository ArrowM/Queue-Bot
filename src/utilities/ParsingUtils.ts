import { Message, NewsChannel, TextChannel, VoiceChannel } from "discord.js";
import { Base } from "./Base";
import { ParsedArguments } from "./Interfaces";
import { MessagingUtils } from "./MessagingUtils";
import { SchedulingUtils } from "./SchedulingUtils";
import { QueueChannelTable } from "./tables/QueueChannelTable";

export class ParsingUtils {
   /**
    * Fetch tailing number from a string. Num must be > 1.
    * Ex:  '!n #general 2' returns 2.
    * @param message
    * @param argument
    */
   public static getTailingNumberFromString(message: Message, argument: string): number {
      // Get number of users to pop
      let arg = argument.split(" ").slice(-1).pop();
      if (arg === "") return null;

      let num = +arg;
      if (isNaN(num)) {
         return undefined;
      } else if (num < 1) {
         SchedulingUtils.scheduleResponseToMessage(`\`amount\` must be a postive number!`, message);
         return undefined;
      } else {
         return num;
      }
   }

   /**
    * Extracts a channel from command arguments. Starting with the largest matching substring
    * @param availableChannels
    * @param parsed
    * @param message
    */
   public static extractChannel(
      parsed: ParsedArguments,
      availableChannels: (VoiceChannel | TextChannel | NewsChannel)[],
      type?: string
   ): VoiceChannel | TextChannel | NewsChannel {
      let channel = availableChannels.find((ch) => ch.id === parsed.message.mentions.channels.array()[0]?.id);
      if (!channel && !parsed.arguments && type !== "voice") {
         channel = parsed.message.channel as TextChannel;
      } else if (!channel && parsed.arguments) {
         const splitArgs = parsed.arguments.split(" ");
         for (let i = splitArgs.length; i > 0; i--) {
            if (channel) {
               break;
            }
            const channelNameToCheck = splitArgs.slice(0, i).join(" ");
            channel =
               availableChannels.find((ch) => ch.name === channelNameToCheck) ||
               availableChannels.find(
                  (ch) =>
                     ch.name.localeCompare(channelNameToCheck, undefined, {
                        sensitivity: "accent",
                     }) === 0
               );
         }
      }
      return channel;
   }

   /**
    * Send a message detailing that a channel was not found.
    * @param parsed
    * @param channels
    * @param includeMention
    * @param type
    */
   public static async reportChannelNotFound(
      parsed: ParsedArguments,
      channels: (VoiceChannel | TextChannel | NewsChannel)[],
      includeMention: boolean,
      isAQueue: boolean,
      type?: string
   ): Promise<void> {
      /* eslint-disable prettier/prettier */
      const target = isAQueue ? "queue" : "channel";
      let response;
      if (channels.length === 0) {

         response =
            "No " + (type ? `**${type}** ` : "") + `queue ${target}s set.\n` +
            "Set a " + (type ? `${type} ` : "") + "queue first using " +
            `\`${parsed.queueGuild.prefix}${Base.getCmdConfig().queueCmd} {${target} name}\`.`;
      } else {
         response =
            "Invalid " + (type ? `**${type}** ` : "") + `${target} name. ` +
            `Try \`${parsed.queueGuild.prefix}${parsed.command} `;
         if (channels.length === 1) {
            // Single channel, recommend the single channel
            response += channels[0].name + (includeMention ? " @{user}" : "") + "`.";
         } else {
            // Multiple channels, list them
            response += `{${target} name}` + (includeMention ? " @{user}" : "") + "`.";
            if (isAQueue) {
               response +=
                  "\nAvailable " + (type ? `**${type}** ` : "") + `queues: ${channels.map((channel) => " `" + channel.name + "`")}.`;
            }
         }
      }
      const channel = parsed.message.channel as TextChannel | NewsChannel;
      MessagingUtils.sendTempMessage(response, channel, 10);
   }

   /**
    * Get a channel using user argument
    * @param parsed
    * @param availableChannels
    * @param includeMention? Include mention in error message
    * @param type? Type of channels to fetch ('voice' or 'text')
    */
   public static getChannel(
      parsed: ParsedArguments,
      availableChannels: (TextChannel | NewsChannel | VoiceChannel)[],
      includeMention?: boolean,
      type?: string
   ): VoiceChannel | TextChannel | NewsChannel {
      if (availableChannels.length > 0) {
         // Extract channel name from message
         const channels = type ? availableChannels.filter((channel) => channel.type === type) : availableChannels;

         if (channels.length === 1) {
            return channels[0];
         } else {
            const channel = this.extractChannel(parsed, channels, type);
            if (channel) {
               return channel;
            } else {
               this.reportChannelNotFound(parsed, channels, includeMention, true, type);
            }
         }
      } else {
         SchedulingUtils.scheduleResponseToMessage(
            `No queue channels set.\n` +
            `Set a queue first using \`${parsed.queueGuild.prefix}${Base.getCmdConfig().queueCmd} {channel name}\`.`,
            parsed.message
         );
      }
      return null;
   }

   /**
    * Get a channel using user argument
    * @param parsed
    * @param includeMention? Include mention in error message
    * @param type? Type of channels to fetch ('voice' or 'text')
    */
   public static async getStoredChannel(
      parsed: ParsedArguments,
      includeMention?: boolean,
      type?: string
   ): Promise<VoiceChannel | TextChannel | NewsChannel> {
      const storedChannels = await QueueChannelTable.fetchStoredQueueChannels(parsed.message.guild);
      return this.getChannel(parsed, storedChannels, includeMention, type);
   }
}
