import { Message, TextChannel, VoiceChannel } from "discord.js";
import config from "../config.json";
import { ParsedArguments, QueueGuild } from "./Interfaces";
import { MessageUtils } from "./MessageUtils";
import { QueueChannelTable } from "./tables/QueueChannelTable";

export class ParsingUtils {
   /**
    * Fetch tailing number from a string.
    * Ex:  '!n #general 2' returns 2.
    * @param message
    * @param argument
    */
   public static getTailingNumberFromString(message: Message, argument: string): number {
      // Get number of users to pop
      let num = +argument.split(" ").slice(-1).pop();
      if (isNaN(num)) {
         num = null;
      } else if (num < 1) {
         MessageUtils.scheduleResponse(message, `\`amount\` must be a postive number!`);
         num = null;
      }
      return num;
   }

   /**
    * Extracts a channel from command arguments. Starting with the largest matching substring
    * @param availableChannels
    * @param parsed
    * @param message
    */
   public static extractChannel(
      availableChannels: Array<VoiceChannel | TextChannel>,
      parsed: ParsedArguments,
      message: Message
   ): VoiceChannel | TextChannel {
      let channel = availableChannels.find((ch) => ch.id === message.mentions.channels.array()[0]?.id);
      if (!channel && parsed.arguments) {
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
    * @param queueGuild
    * @param parsed
    * @param channels
    * @param message
    * @param includeMention
    * @param type
    */
   public static reportChannelNotFound(
      queueGuild: QueueGuild,
      parsed: ParsedArguments,
      channels: Array<VoiceChannel | TextChannel>,
      message: Message,
      includeMention: boolean,
      type: string
   ): void {
      let response;
      if (channels.length === 0) {
         response =
            "No " +
            (type ? `**${type}** ` : "") +
            "queue channels set." +
            "\nSet a " +
            (type ? `${type} ` : "") +
            `queue first using \`${queueGuild.prefix}${config.queueCmd} {channel name}\`.`;
      } else {
         response = "Invalid " + (type ? `**${type}** ` : "") + `channel name. Try \`${queueGuild.prefix}${parsed.command} `;
         if (channels.length === 1) {
            // Single channel, recommend the single channel
            response += channels[0].name + (includeMention ? " @{user}" : "") + "`.";
         } else {
            // Multiple channels, list them
            response +=
               "{channel name}" +
               (includeMention ? " @{user}" : "") +
               "`." +
               "\nAvailable " +
               (type ? `**${type}** ` : "") +
               `channel names: ${channels.map((channel) => " `" + channel.name + "`")}.`;
         }
      }
      MessageUtils.scheduleResponse(message, response);
   }

   /**
    * Get a channel using user argument
    * @param queueGuild
    * @param parsed
    * @param message
    * @param includeMention? Include mention in error message
    * @param type? Type of channels to fetch ('voice' or 'text')
    */
   public static async fetchChannel(
      queueGuild: QueueGuild,
      parsed: ParsedArguments,
      message: Message,
      includeMention?: boolean,
      type?: string
   ): Promise<VoiceChannel | TextChannel> {
      const guild = message.guild;
      const storedChannels = await QueueChannelTable.fetchStoredQueueChannels(guild);

      if (storedChannels.length > 0) {
         // Extract channel name from message
         const availableChannels = type ? storedChannels.filter((channel) => channel.type === type) : storedChannels;

         if (availableChannels.length === 1) {
            return availableChannels[0];
         } else {
            const channel = this.extractChannel(availableChannels, parsed, message);
            if (channel) {
               return channel;
            } else {
               this.reportChannelNotFound(queueGuild, parsed, availableChannels, message, includeMention, type);
            }
         }
      } else {
         MessageUtils.scheduleResponse(
            message,
            `No queue channels set.` + `\nSet a queue first using \`${queueGuild.prefix}${config.queueCmd} {channel name}\`.`
         );
      }
      return null;
   }
}
