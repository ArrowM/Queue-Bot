import { EmbedBuilder } from "discord.js";

export const embeds = [
	new EmbedBuilder()
		.setTitle("Summary of Recent Reworks")
		.setColor("#74ceaf")
		.setDescription(`Howdy! There have been some significant changes to the bot lately without much of an explanation. So, I am making this post summarize what's new and what's changed.
### Everyone Commands
- ~~\`/display\`~~ migrated to \`/show\`
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
~~\`is_inline\`~~ migrated to \`/queues set inline_toggle\`
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
		)
		.setFooter({ text: "This message can be viewed again with `/help patch-notes`" }),
];