import { EmbedBuilder } from "discord.js";

export const embeds = [
	new EmbedBuilder()
		.setTitle("New Queue Setting")
		.setColor("#f6d37b")
		.addFields(
			{
				name: "require_message_to_join",
				value: `- This new toggleable queue option requires users to set a message when they join a queue. It works for \`/join\` and joining via button. It can be set with the command \`/queues set require_message_to_join\`.`,
			},
			{
				name: "Misc fixes",
				value: "Various bug fixes and improvements have been made. Thank you for your patience and reports!",
			},
			{
				name: "💖 Support Development",
				value: "Consider [buying me a coffee or tea](https://www.buymeacoffee.com/Arroww). Your support is greatly appreciated!",
			}
		),
];