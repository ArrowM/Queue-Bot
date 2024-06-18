import { EmbedBuilder } from "discord.js";

export const embeds = [
	new EmbedBuilder()
		.setTitle("🎉 Announcing Queue Bot 2 🎉")
		.setColor("#f6d37b")
		.setDescription("I'm excited to announce Queue Bot 2! There's no need to invite a new bot, this one has been updated.")
		.addFields(
			{
				name: "🐣 What's New?",
				value: `- **Queues are no longer linked to channels.** Name them whatever you like, create as many as you need, and enjoy continued voice integration support!
- **Reworked Commands.** Most commands have been overhauled for better functionality (details below).
- **Updated Styling.** Enhanced visuals for queue displays, command responses, and error messages.
- **More Buttons and Colors.** Increased interactivity and visual appeal.
- **Significant Under-the-Hood Improvements.** The bot has been rewritten from the ground up, resulting in overall better performance and easier implementation of new features.

The new command structure is object-based. Commands like \`/color\` and \`header\` are now part of \`/queues\`, which includes options for all queue properties. Commands like \`/join\` and \`leave\` remain unchanged. Command registration is no longer required, making command options easier to use.`,
			},
			{
				name: "🪲 Report Bugs",
				value: "As this is all new code, new bugs are expected. Please report them in the [Support Server](https://discord.gg/RbmfnP3) (also linked in profile).",
			},
			{
				name: "🎨 Feature Suggestions",
				value: "Have a cool idea for a feature? Share it in the #suggestions channel of the [Support Server](https://discord.gg/RbmfnP3).",
			},
			{
				name: "💖 Support Development",
				value: "If you'd like to support the development, consider [buying me a coffee (or green tea)](https://www.buymeacoffee.com/Arroww). Your support is greatly appreciated!",
			}
		),
];