import { EmbedBuilder, inlineCode, SlashCommandBuilder } from "discord.js";

import { EveryoneCommand } from "../../types/command.types.ts";
import { Color } from "../../types/db.types.ts";
import type { SlashInteraction } from "../../types/interaction.types.ts";
import { commandMention } from "../../utils/string.utils.ts";

export class HelpCommand extends EveryoneCommand {
	static readonly ID = "help";

	help_setup = HelpCommand.help_setup;
	help_general = HelpCommand.help_general;
	help_admin = HelpCommand.help_admin;
	help_patch_notes = HelpCommand.help_patch_notes;

	data = new SlashCommandBuilder()
		.setName(HelpCommand.ID)
		.setDescription("Get help")
		.addSubcommand(subcommand =>
			subcommand
				.setName("setup")
				.setDescription("Get help with setting up")
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("general")
				.setDescription("Get help with general tasks like joining and leaving queues")
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName("admin")
				.setDescription("Get help with admin tasks like managing queues")
		);

	// ====================================================================
	//                           /help setup
	// ====================================================================

	static async help_setup(inter: SlashInteraction) {
		await inter.respond({
			embeds: [
				new EmbedBuilder()
					.setTitle("Setup Help")
					.setColor(Color.Indigo)
					.setDescription(
						"Hello there, I'm Queue Bot! I provide live user queues. Here are the steps to get started with me. "
					)
					.addFields({
						name: "1. Create queues",
						value: "Create queues by typing `/queues add`. You can create as many queues as you want.",
					},
					{
						name: "2. Add Members",
						value: `Members can join by clicking the 'Join' button beneath queue displays, ${commandMention("join")}, or by entering an integrated voice channel. ` +
								`Admins may also enqueue users with ${commandMention("members", "add")}.`,
					},
					{
						name: "3. Pull Members",
						value: `Members can be pulled from queues by admins by clicking the 'Pull' button queue displays or with ${commandMention("pull")}.`,
					},
					{
						name: "4. Explore other commands",
						value: `${commandMention("help", "general")} explains how to join and leave queues. ${commandMention("help", "admin")} explains how admins can manage queues.`,
					}),
			],
		});
	}

	// ====================================================================
	//                           /help general
	// ====================================================================

	static async help_general(inter: SlashInteraction) {
		await inter.respond({
			embeds: [
				new EmbedBuilder()
					.setTitle("General Help")
					.setColor(Color.Indigo)
					.setDescription(
						"Hello there, I'm Queue Bot! I provide live user queues. " +
						"Here are the commands available to everyone. " +
						"Some commands have required and optional arguments, so be sure to read them! " +
						"Options can be selected by typing and hitting tab will auto-complete. "
					)
					.addFields({
						name: commandMention("join"),
						value: "Join queues",
					},
					{
						name: commandMention("leave"),
						value: "Leave queues",
					},
					{
						name: commandMention("positions"),
						value: "Get your positions in all queues",
					},
					{
						name: commandMention("show"),
						value: "Show queue(s)",
					}),
			],
		});
	}

	// ====================================================================
	//                           /help admin
	// ====================================================================

	static async help_admin(inter: SlashInteraction) {
		await inter.respond({
			embeds: [
				new EmbedBuilder()
					.setTitle("Admin Help")
					.setColor(Color.Indigo)
					.setDescription(
						"Hello there, I'm Queue Bot! I provide live user queues. " +
						`Here are the commands only available to server admins and users added via ${commandMention("admins", "add")}. ` +
						`Some commands have additional subcommands like ${inlineCode("add")} or ${inlineCode("delete")}. `
					)
					.addFields({
						name: commandMention("admins", "get"),
						value: "Manage admin users and roles",
					},
					{
						name: commandMention("blacklist", "get"),
						value: "Blacklist a user or role from queues",
					},
					{
						name: commandMention("clear"),
						value: "Clear queues",
					},
					{
						name: commandMention("displays", "get"),
						value: "Manage display channels",
					},
					{
						name: commandMention("logging", "get"),
						value: "Manage logging settings",
					},
					{
						name: commandMention("members", "get"),
						value: "Manage queue members",
					},
					{
						name: commandMention("move"),
						value: "Move a member in queues",
					},
					{
						name: commandMention("prioritize", "get"),
						value: "Manage prioritized users and roles",
					},
					{
						name: commandMention("pull"),
						value: "Pull members from queue(s)",
					},
					{
						name: commandMention("queues", "get"),
						value: "Manage queues",
					},
					{
						name: commandMention("schedules", "get"),
						value: "Manage schedules",
					},
					{
						name: commandMention("shuffle"),
						value: "Shuffle queues",
					},
					{
						name: commandMention("voice", "get"),
						value: "Manage voice channel settings",
					},
					{
						name: commandMention("whitelist", "get"),
						value: "Whitelist a user or role in queues",
					}),
			],
		});
	}

	// ====================================================================
	//                           /help admin
	// ====================================================================

	static async help_patch_notes(inter: SlashInteraction) {
		await inter.respond({
			embeds: [
				new EmbedBuilder()
					.setTitle("Summary of Recent Reworks")
					.setColor("#74ceaf")
					.setDescription(`Howdy! There have been some significant changes to the bot lately without much of an explanation. So I am making this post summarize what's new and what's changed.
### Everyone Commands
- ~~\`/display\`~~ > \`/show\`
- \`/help\` changed submenus
- \`/join\`
- \`/leave\`
- \`/positions\`
### Admin Commands
- ~~\`/autopull\`~~ migrated to \`/queues set autopull_toggle\`
- ~~\`/blacklist\`~~ made queue specific 
- ~~\`/button\`~~ migrated to \`/queues set button_toggle\`
- \`/clear\`
- ~~\`/color\`~~ migrated to \`/queues set color\`
- ~~\`/dequeue\`~~ migrated to \`/members delete\`
- ~~\`/enqueue\`~~ migrated to \`/members add\`
- ~~\`/graceperiod\`~~ migrated to \`/queues set rejoin_grace_period\`
- ~~\`/header\`~~ migrated to \`/queues set header\`
- ~~\`/lock\`~~ migrated to \`/queues set lock_toggle\`
- \`/logging\` reformatted
- ~~\`/mentions\`~~ migrated to \`/queues set member_display_type\`
- ~~\`/mode\`~~ migrated to \`/queues set display_update_type\`
- \`/move\`
- ~~\`/mute\`~~ removed
- ~~\`/next\`~~ migrated to \`/pull\`
- ~~\`/notifications\`~~ migrated to \`/queues set notification_toggle\`
- ~~\`/permission\`~~ - migrated to \`/admins\`
- ~~\`/priority\`~~ migrated to \`/prioritize\`
- ~~\`/pullnum\`~~ migrated to \`/queues set pull_batch_size\`
- \`/queues\` queue-specific settings have been moved to this command
- ~~\`/roles\`~~ migrated to \`/queues set role_in_queue role_on_pull\`
- \`/schedule\` made easier to use
- \`/shuffle\`
- ~~\`/size\`~~ migrated to \`/queues set size\`
- ~~\`/start\`~~ removed (bot no longer joins vs)
- ~~\`/target\`~~ migrated to \`/queues set voice_destination_channel\`
- ~~\`/timestamps\`~~ migrated to \`/queues set timestamp_type\`
- \`/to-me\`
- \`/whitelist\` made queue specific
### New & Updated Queue Properties
- \`/queues set badge_toggle\` toggles the visibility of badges (🔒, 🔕, 🔁, 🔇) next to queue names. Badges indicate an important queue property has been enabled:
- 🔒 = \`lock_toggle\` enabled
- 🔕 = \`notifications_toggle\` enabled
- 🔁 = \`autopull_toggle\` enabled
- 🔇 = \`voice_only_toggle\` enabled
~~\`is_inline\` ~~  migrated to \`/queues set inline_toggle\`
- \`/queues set pull_message\` add a custom message to include in pull messages
- \`/queues set rejoin_cooldown_period\` require users to wait a specified amount before rejoining
- \`/queues set voice_only\` restrict queue to members in linked voice channel (hides buttons and prevents \`/join\`)
### New Commands
- \`/displays\`:
  - \`/displays get\` list channels containing queue displays
  - \`/displays add\` same as \`/show\`
  - \`/displays delete\` unsubscribe a channel from receiving queue updates
- \`/voice\` configure voice channel integrations with queues. Now you can set multiple source channels
`)
					.addFields(
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
			],
		});
	}
}
