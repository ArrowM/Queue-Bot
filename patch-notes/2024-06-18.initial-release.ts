import { EmbedBuilder } from "discord.js";

export const embeds = [
	new EmbedBuilder()
		.setTitle(
			`Announcing the demo of QueueBot 2! 🎉`,
		)
		.setColor(
			"#f3be35",
		)
		.setDescription(
			`I'm excited to announce the demo of Queue Bot 2! There is an invite link at the bottom of this message.`,
		)
		.addFields(
			{
				name: `🐣 What's new?`,
				value: `- **Queues are no longer linked to channels.** Name them whatever you like and make as many as you want.
- **A rewrite of the commands.** Commands now make use of new Discord features. They should be faster to use and much more intuitive.
- **Updated styling.** The queue displays, command response, and error messages have been improved.
- **More buttons and colors.** What could be better?
- **Code improvements.** I rewrote the bot from the ground up. The new code base is much easier to work with, so adding new features is much easier now. :)`,
			},
			{
				name: `🛠️ Features in progress`,
				value: `There are a few features that I have not ported over yet, but should be coming soon:
- **Roles assigned to queue members.**
- **Voice channel integration.**
- **Logging** with some extra stats.
- **Rejoin cooldown.** 
- **And more.** I be looking at the #suggestions channel in the support server.`,
			},
			{
				name: `🪲 It's a demo`,
				value: `- **There will be new bugs.** Hopefully I can fix them all in the first week or so, but no promises.
- **Please send bugs or other inquiries in the #support channel of this server.**`,
			},
			{
				name: `💖 Support`,
				value: `- If you want to support development, [buy me a coffee (or green tea)](https://www.buymeacoffee.com/Arroww).`,
			},
			{
				name: `🔗 INVITE`,
				value: `[Click here to invite the bot to your server!](https://discord.com/oauth2/authorize?client_id=721401878654484630)`,
			},
		),
];
