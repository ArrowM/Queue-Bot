import {
	ActionRowBuilder,
	type APIEmbedField,
	bold,
	ButtonBuilder,
	channelMention,
	codeBlock,
	EmbedBuilder,
	type GuildTextBasedChannel,
	inlineCode,
	type Message,
	roleMention,
	type Snowflake,
} from "discord.js";
import { compact, isNil, uniq } from "lodash-es";

import { BUTTONS } from "../buttons/buttons.loader.ts";
import { JoinButton } from "../buttons/buttons/join.button.ts";
import { LeaveButton } from "../buttons/buttons/leave.button.ts";
import { MyPositionsButton } from "../buttons/buttons/my-positions.button.ts";
import { PullButton } from "../buttons/buttons/pull.button.ts";
import { incrementGuildStat } from "../db/db-scheduled-tasks.ts";
import { Queries } from "../db/queries.ts";
import { type DbDisplay, type DbMember, type DbQueue } from "../db/schema.ts";
import { Store } from "../db/store.ts";
import type { Button } from "../types/button.types.ts";
import { Color, DisplayUpdateType, Scope } from "../types/db.types.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import { CustomError } from "./error.utils.ts";
import { InteractionUtils } from "./interaction.utils.ts";
import { map } from "./misc.utils.ts";
import { commandMention, memberMention, membersMention, mentionablesMention, queueMention, scheduleMention, timeMention } from "./string.utils.ts";


export interface DisplayMessage {
	embeds: EmbedBuilder[];
	components: any[];
}

export interface DisplayUpdate {
	store: Store;
	queueId: bigint;
	opts?: {
		displayIds?: bigint[];
		updateTypeOverride?: DisplayUpdateType;
	};
}

export interface DisplaysUpdate extends Omit<DisplayUpdate, "queueId"> {
	queueIds: bigint[];
}

// Rate limiting and queue management
class DisplayUpdateManager {
	private static instance: DisplayUpdateManager;
	private updatedQueueIds = new Set<bigint>();
	private pendingQueueIds = new Map<bigint, DisplayUpdate>();
	private retryTracker = new Map<string, number>();
	private maxRetries = 3;

	private constructor() {
	}

	public static getInstance(): DisplayUpdateManager {
		if (!DisplayUpdateManager.instance) {
			DisplayUpdateManager.instance = new DisplayUpdateManager();
		}
		return DisplayUpdateManager.instance;
	}

	public addUpdate(update: DisplayUpdate): void {
		const { queueId } = update;
		if (this.updatedQueueIds.has(queueId)) {
			this.pendingQueueIds.set(queueId, update);
		}
		else {
			DisplayUtils.updateDisplays(update);
		}
	}

	public markUpdated(queueId: bigint): void {
		this.updatedQueueIds.add(queueId);
	}

	public getAndClearPending(): Map<bigint, DisplayUpdate> {
		const pendingCopy = new Map(this.pendingQueueIds);
		this.pendingQueueIds.clear();
		this.updatedQueueIds.clear();
		return pendingCopy;
	}

	public shouldRetry(displayId: bigint, queueId: bigint): boolean {
		const key = `${displayId}-${queueId}`;
		const count = (this.retryTracker.get(key) || 0) + 1;
		this.retryTracker.set(key, count);
		return count < this.maxRetries;
	}

	public resetRetry(displayId: bigint, queueId: bigint): void {
		this.retryTracker.delete(`${displayId}-${queueId}`);
	}
}

export namespace DisplayUtils {
	const updateManager = DisplayUpdateManager.getInstance();

	// Process pending updates every 1.5 seconds
	setInterval(() => {
		updateManager.getAndClearPending().forEach(update => updateDisplays(update));
	}, 1500);

	export async function insertDisplays(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, displayChannelId: Snowflake) {
		const insertedDisplays = compact(
			map(queues, queue => store.insertDisplay({
				guildId: store.guild.id,
				queueId: queue.id,
				displayChannelId,
			}))
		);
		const updatedQueueIds = uniq(insertedDisplays.map(display => display.queueId));

		requestDisplaysUpdate({
			store,
			queueIds: updatedQueueIds,
			opts: {
				displayIds: insertedDisplays.map(display => display.id),
				updateTypeOverride: DisplayUpdateType.Replace,
			},
		});

		return { insertedDisplays, updatedQueueIds };
	}

	export function deleteDisplays(store: Store, displayIds: bigint[]) {
		const deletedDisplays = compact(displayIds.map(displayId =>
			store.deleteDisplay({ id: displayId })
		));
		const updatedQueueIds = uniq(deletedDisplays.map(display => display.queueId));

		return { deletedDisplays, updatedQueueIds };
	}

	export function requestDisplayUpdate(displayUpdate: DisplayUpdate): void {
		updateManager.addUpdate(displayUpdate);
	}

	export function requestDisplaysUpdate(displaysUpdate: DisplaysUpdate): void {
		uniq(displaysUpdate.queueIds).forEach(queueId =>
			requestDisplayUpdate({ ...displaysUpdate, queueId })
		);
	}

	export async function updateDisplays(displayUpdate: DisplayUpdate): Promise<void> {
		const { store, queueId, opts } = displayUpdate;
		updateManager.markUpdated(queueId);

		try {
			const queue = store.dbQueues().get(queueId);
			let displays = store.dbDisplays().filter(display => queueId === display.queueId);

			if (opts?.displayIds) {
				displays = displays.filter(display => opts.displayIds.includes(display.id));
			}

			if (!queue || displays.size === 0) return;

			const displayMessage = await buildQueueDisplayMessage(store, queue);

			// Process all displays in parallel
			await Promise.all(displays.map(display =>
				processDisplay(store, queue, display, displayMessage, opts?.updateTypeOverride)
			));

			incrementGuildStat(store.guild.id, "displaysAdded", displays.size);
		}
		catch (e) {
			logError("Failed to update displays", e as Error);
		}
	}

	// Extracted function to process each display
	async function processDisplay(
		store: Store,
		queue: DbQueue,
		display: DbDisplay,
		message: DisplayMessage,
		updateTypeOverride?: DisplayUpdateType
	): Promise<void> {
		try {
			const channel = await store.jsChannel(display.displayChannelId) as GuildTextBasedChannel;

			try {
				await InteractionUtils.verifyCanSendMessages(channel);
			}
			catch (e) {
				store.deleteDisplay(display);
				await store.inter?.member.send({ embeds: (e as CustomError).embeds }).catch(() => null);
				return;
			}

			let lastMessage: Message | null = null;
			if (display.lastMessageId) {
				lastMessage = await channel.messages.fetch(display.lastMessageId).catch(() => null as unknown as Message);
			}

			const updateType = updateTypeOverride ?? queue.displayUpdateType;
			await updateDisplayMessage(channel, store, display, message, lastMessage, updateType);

			// Reset retry counter on success
			updateManager.resetRetry(display.id, queue.id);
		}
		catch (e) {
			await handleFailedDisplayUpdate(store, queue, display, e as Error);
		}
	}

	// Strategy pattern for different update types
	async function updateDisplayMessage(
		channel: GuildTextBasedChannel,
		store: Store,
		display: DbDisplay,
		message: DisplayMessage,
		lastMessage: Message | null,
		updateType: DisplayUpdateType
	): Promise<void> {
		switch (updateType) {
			case DisplayUpdateType.New:
				await sendNewDisplay(channel, store, display, message);
				break;
			case DisplayUpdateType.Edit:
			case DisplayUpdateType.LatestMessage:
				if (lastMessage) {
					try {
						await lastMessage.edit(message);
					}
					catch {
						await sendNewDisplay(channel, store, display, message);
					}
				}
				else {
					await sendNewDisplay(channel, store, display, message);
				}
				break;
			case DisplayUpdateType.Replace:
				await lastMessage?.delete().catch(() => null);
				await sendNewDisplay(channel, store, display, message);
				break;
		}
	}

	// Helper for creating new display messages
	async function sendNewDisplay(
		channel: GuildTextBasedChannel,
		store: Store,
		display: DbDisplay,
		message: DisplayMessage
	): Promise<void> {
		const sentMessage = await channel.send(message);
		store.updateDisplay({
			guildId: store.guild.id,
			id: display.id,
			lastMessageId: sentMessage.id,
		});
	}

	async function handleFailedDisplayUpdate(
		store: Store,
		queue: DbQueue,
		display: DbDisplay,
		error: Error
	): Promise<void> {
		try {
			const isPermissionError = /access|permission/i.test(error.message);
			if (!isPermissionError) {
				logError("Display update failed", error);
			}

			// Only notify if we haven't exceeded retry limit
			if (!updateManager.shouldRetry(display.id, queue.id)) return;

			if (store.inter) {
				const embed = new EmbedBuilder()
					.setTitle("Failed to display queue")
					.setColor(Color.Red)
					.setDescription(
						`Hey ${store.inter.member}, I just tried to display the ${queueMention(queue)} queue in ${channelMention(display.displayChannelId)}, but something went wrong. ` +
						(isPermissionError ? bold(`It looks like a permission issue, please check the bot's perms in ${channelMention(display.displayChannelId)}. `) : "") +
						`Here's the error:${codeBlock(error.message)}`
					);

				if (!isPermissionError) {
					embed.setFooter({ text: "This error has been logged and will be investigated by the developers." });
				}

				await store.inter.respond({ embeds: [embed] });
			}
		}
		catch (handlingError) {
			logError("Error handler failed", handlingError as Error);
		}
	}

	function logError(context: string, error: Error): void {
		console.error(`${context}:`);
		console.error(`Error: ${error.message}`);
		console.error(`Stack Trace: ${error.stack}`);
	}

	// ====================================================================
	//                        Member Display Formatting
	// ====================================================================

	export async function createMembersDisplayLine(
		store: Store,
		members: DbMember[],
		rightPadding = 0
	): Promise<string[]> {
		const mentions = await membersMention(store, members);
		return mentions.map((mention, position) =>
			formatMemberDisplayLine(mention, position + 1, rightPadding)
		);
	}

	export async function createMemberDisplayLine(
		store: Store,
		member: DbMember,
		position: number,
		rightPadding = 0
	): Promise<string> {
		const mention = await memberMention(store, member);
		return formatMemberDisplayLine(mention, position, rightPadding);
	}

	export function formatMemberDisplayLine(
		memberMention: string,
		position: number,
		rightPadding = 0
	): string {
		return `${inlineCode(position.toString().padEnd(rightPadding))}${memberMention}\n`;
	}

	// ====================================================================
	//                       Message Building Logic
	// ====================================================================

	async function buildQueueDisplayEmbeds(store: Store, queue: DbQueue): Promise<EmbedBuilder[]> {
		const members = [...store.dbMembers().filter(member => member.queueId === queue.id).values()];
		const rightPadding = `${members.length}`.length;
		const memberDisplayLines = await createMembersDisplayLine(store, members, rightPadding);

		const title = queueMention(queue);
		const description = buildDescription(store, queue);
		const sizeStr = `size: ${memberDisplayLines.length}${queue.size ? ` / ${queue.size}` : ""}`;

		const embeds: EmbedBuilder[] = [];
		let currentEmbed = new EmbedBuilder()
			.setColor(queue.color)
			.setTitle(title)
			.setDescription(description);

		let fields: APIEmbedField[] = [];
		let currentField: APIEmbedField = {
			name: sizeStr || "\u200b",
			value: "\u200b",
			inline: queue.inlineToggle,
		};

		let totalChars = title.length + description.length + sizeStr.length;

		// Process each member line
		for (const line of memberDisplayLines) {
			// Check message size limits
			if (totalChars + line.length >= 6000) break;
			totalChars += line.length;

			// Check field size limits
			if (currentField.value.length + line.length >= 1024) {
				fields.push(currentField);
				currentField = { name: "\u200b", value: line, inline: queue.inlineToggle };

				// Check if we need a new embed (25 fields max)
				if (fields.length === 25) {
					currentEmbed.setFields(fields);
					embeds.push(currentEmbed);

					// Max 10 embeds per message
					if (embeds.length === 10) break;

					currentEmbed = new EmbedBuilder()
						.setColor(queue.color)
						.setTitle(title)
						.setDescription(description);
					fields = [];
				}
			}
			else {
				currentField.value += line;
			}
		}

		// Add remaining fields and embed
		if (currentField.value && currentField.value !== "\u200b") {
			fields.push(currentField);
		}

		if (fields.length > 0) {
			currentEmbed.setFields(fields);
			embeds.push(currentEmbed);
		}

		// Handle empty queues
		if (embeds.length === 0) {
			currentEmbed.setFields({ name: sizeStr || "\u200b", value: "\u200b", inline: queue.inlineToggle });
			embeds.push(currentEmbed);
		}

		return embeds;
	}

	function buildDescription(store: Store, queue: DbQueue): string {
		const parts: string[] = [];
		const schedules = store.dbSchedules().filter(schedule => queue.id === schedule.queueId);

		// Add header if present
		if (queue.header) parts.push(`${queue.header}\n`);

		// Queue status section
		if (queue.lockToggle) {
			parts.push("- Queue is locked.");
		}
		else {
			// Voice channel configuration
			const voices = store.dbVoices().filter(voice => voice.queueId === queue.id);
			if (voices.size) {
				const isAutoPulling = queue.autopullToggle && queue.voiceDestinationChannelId;
				const pullMethodStr = isAutoPulling ? "Automatically" : "Manually";
				const srcStr = voices.map(voice => channelMention(voice.sourceChannelId)).join(", ");
				const dstStr = queue.voiceDestinationChannelId ?
					` to ${channelMention(queue.voiceDestinationChannelId)}` : "";
				parts.push(`- ${pullMethodStr} pulling members from ${srcStr}${dstStr}`);
			}
			else if ([Scope.NonAdmin, Scope.All].includes(queue.buttonsToggle)) {
				parts.push(`${commandMention("join")}, ${commandMention("leave")}, or click the buttons below.`);
			}
			else {
				parts.push(`${commandMention("join")} or ${commandMention("leave")}.`);
			}

			// Queue rules
			if (queue.rejoinCooldownPeriod) {
				parts.push(`- After being pulled, you must wait ${timeMention(queue.rejoinCooldownPeriod)} to requeue.`);
			}

			if (queue.rejoinGracePeriod) {
				parts.push(`- Rejoin within ${timeMention(queue.rejoinGracePeriod)} of leaving to reclaim your spot.`);
			}
		}

		// Whitelist configuration
		const whitelisted = Queries.selectManyWhitelisted({ guildId: store.guild.id, queueId: queue.id });
		if (whitelisted.length) {
			parts.push(`- Only whitelisted members may join: ${mentionablesMention(whitelisted)}.`);
		}

		// Member attributes
		const members = store.dbMembers().filter(member => member.queueId === queue.id);
		if (members.some(m => !isNil(m.priorityOrder))) {
			parts.push("- ✨ indicates priority.");
		}

		// Role assignments
		if (queue.roleInQueueId) {
			parts.push(`- Members are assigned the ${roleMention(queue.roleInQueueId)} role while in queue.`);
		}

		if (queue.roleOnPullId) {
			parts.push(`- Members are assigned the ${roleMention(queue.roleOnPullId)} role when pulled from queue.`);
		}

		// Join requirements
		if (queue.requireMessageToJoin) {
			parts.push("- A message is required to join the queue.");
		}

		// Schedules
		if (schedules.size) {
			parts.push(schedules.sort().map(schedule => `- ${scheduleMention(schedule)}`).join("\n"));
		}

		return parts.join("\n");
	}

	function buildQueueDisplayButtons(queue: DbQueue) {
		if (queue.buttonsToggle === Scope.None) return;

		const buttons = [];

		// User buttons
		if ([Scope.NonAdmin, Scope.All].includes(queue.buttonsToggle) && !queue.voiceOnlyToggle) {
			buttons.push(BUTTONS.get(JoinButton.ID));
			buttons.push(BUTTONS.get(LeaveButton.ID));
			buttons.push(BUTTONS.get(MyPositionsButton.ID));
		}

		// Admin buttons
		if ([Scope.Admin, Scope.All].includes(queue.buttonsToggle)) {
			buttons.push(BUTTONS.get(PullButton.ID));
		}

		return buttons.map(buildButton);
	}

	function buildButton(button: Button): ButtonBuilder {
		return new ButtonBuilder()
			.setCustomId(button.customId)
			.setLabel(button.label)
			.setStyle(button.style);
	}

	async function buildQueueDisplayMessage(store: Store, queue: DbQueue): Promise<DisplayMessage> {
		const embeds = await buildQueueDisplayEmbeds(store, queue);
		const buttons = buildQueueDisplayButtons(queue);

		return {
			embeds,
			components: buttons?.length
				? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons).toJSON()]
				: [],
		};
	}
}