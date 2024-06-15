import type { RestOrArray } from "@discordjs/builders";
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
import { type DbDisplay, type DbMember, type DbQueue } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import type { Button } from "../types/button.types.ts";
import { Color, DisplayUpdateType } from "../types/db.types.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import type { CustomError } from "./error.utils.ts";
import { InteractionUtils } from "./interaction.utils.ts";
import { map } from "./misc.utils.ts";
import { commandMention, memberMention, queueMention, scheduleMention, timeMention } from "./string.utils.ts";

export namespace DisplayUtils {
	export async function insertDisplays(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, displayChannelId: Snowflake) {
		const insertedDisplays = map(queues, (queue) => store.insertDisplay({
			guildId: store.guild.id,
			queueId: queue.id,
			displayChannelId,
		}));
		const updatedQueueIds = uniq(insertedDisplays.map(display => display.queueId));

		DisplayUtils.requestDisplaysUpdate(
			store,
			updatedQueueIds,
			{
				displayIds: insertedDisplays.map(display => display.id),
				updateTypeOverride: DisplayUpdateType.Replace,
			});

		return { insertedDisplays, updatedQueueIds };
	}

	export function deleteDisplays(store: Store, displayIds: bigint[]) {
		// delete from db
		const deletedDisplays = displayIds.map(displayId =>
			store.deleteDisplay({ id: displayId }),
		);
		const updatedQueueIds = uniq(deletedDisplays.map(display => display.queueId));

		return { deletedDisplays, updatedQueueIds };
	}

	// ====================================================================
	//                           Display runner
	// ====================================================================

	const UPDATED_QUEUE_IDS = new Map<bigint, Store>();
	const PENDING_QUEUE_IDS = new Map<bigint, Store>();

	setInterval(() => {
		PENDING_QUEUE_IDS.forEach((store, queueId) =>
			updateDisplays(store, queueId),
		);
		UPDATED_QUEUE_IDS.clear();
		PENDING_QUEUE_IDS.clear();
	}, 1500);

	export function requestDisplayUpdate(store: Store, queueId: bigint, opts?: {
		displayIds?: bigint[],
		updateTypeOverride?: DisplayUpdateType,
	}) {
		if (UPDATED_QUEUE_IDS.has(queueId)) {
			PENDING_QUEUE_IDS.set(queueId, store);
		}
		else {
			updateDisplays(store, queueId, opts);
		}
	}

	export function requestDisplaysUpdate(store: Store, queueIds: bigint[], opts?: {
		displayIds?: bigint[],
		updateTypeOverride?: DisplayUpdateType,
	}) {
		return uniq(queueIds).map(queueId => requestDisplayUpdate(store, queueId, opts));
	}

	export async function createMemberDisplayLine(
		store: Store,
		member: DbMember,
		position: number,
		rightPadding = 0,
	) {
		const idxStr = inlineCode(position.toString().padEnd(rightPadding));
		return `${idxStr}${await memberMention(store, member)}\n`;
	}

	async function updateDisplays(store: Store, queueId: bigint, opts?: {
		displayIds?: bigint[],
		updateTypeOverride?: DisplayUpdateType
	}) {
		try {
			UPDATED_QUEUE_IDS.set(queueId, store);

			const queue = store.dbQueues().get(queueId);
			let displays = store.dbDisplays().filter(display => queue.id === display.queueId);
			if (opts?.displayIds) {
				displays = displays.filter(display => opts.displayIds.includes(display.id));
			}

			const embedBuilders = await generateQueueDisplay(store, queue);

			// Send update

			await Promise.all(displays.map(async (display) => {
				try {
					const jsChannel = await store.jsChannel(display.displayChannelId) as GuildTextBasedChannel;
					try {
						await InteractionUtils.verifyCanSendMessages(jsChannel);
					}
					catch (e) {
						store.deleteDisplay(display);
						if (store.inter?.member) {
							await store.inter.member.send({ embeds: (e as CustomError).embeds });
						}
						return;
					}

					let lastMessage: Message;
					if (display.lastMessageId) {
						lastMessage = await jsChannel.messages.fetch(display.lastMessageId).catch(() => null as Message);
					}

					async function newDisplay() {
						// Send new display
						const message = await jsChannel.send({
							embeds: embedBuilders,
							components: getButtonRow(queue),
						});
						if (message) {
							// Remove buttons on the previous message
							await lastMessage?.edit({
								embeds: embedBuilders,
								components: [],
							}).catch(() => null);
							// Update the display
							store.updateDisplay({
								guildId: store.guild.id,
								id: display.id,
								lastMessageId: message.id,
							});
						}
					}

					async function editDisplay() {
						if (lastMessage) {
							try {
								await lastMessage.edit({
									embeds: embedBuilders,
									components: getButtonRow(queue),
								});
							}
							catch {
								await newDisplay();
							}
						}
						else {
							await newDisplay();
						}
					}

					async function replaceDisplay() {
						await lastMessage?.delete().catch(() => null);
						await newDisplay();
					}

					const updateType = opts?.updateTypeOverride ?? queue.displayUpdateType;
					switch (updateType) {
						case DisplayUpdateType.New:
							await newDisplay();
							break;
						case DisplayUpdateType.Edit:
							await editDisplay();
							break;
						case DisplayUpdateType.Replace:
							await replaceDisplay();
							break;
					}
				}
				catch (e: any) {
					await handleFailedDisplayUpdate(store, queue, display, e);
				}
			}));

			incrementGuildStat(store.guild.id, "displaysAdded", displays.size);
		}
		catch (e: any) {
			const { message, stack } = e as Error;
			console.error("Failed to update displays:");
			console.error(`Error: ${message}`);
			console.error(`Stack Trace: ${stack}`);
		}
	}

	async function handleFailedDisplayUpdate(store: Store, queue: DbQueue, display: DbDisplay, e: Error) {
		try {
			const { message, stack } = e as Error;
			const isPermissionError = /access|permission/i.test(message);
			if (store.inter?.member) {
				const embed = new EmbedBuilder()
					.setTitle("Failed to display queue")
					.setColor(Color.Red)
					.setDescription(
						`Hey ${store.inter.member}, I just tried to display the '${queueMention(queue)}' queue in ${channelMention(display.displayChannelId)}, but something went wrong. ` +
						(isPermissionError ? bold(`It looks like a permission issue, please check the bot's perms in ${channelMention(display.displayChannelId)}. `) : "") +
						`Here's the error:${codeBlock(message)}`,
					);
				if (!isPermissionError) {
					embed.setFooter({ text: "This error has been logged and will be investigated by the developers." });
				}
				await store.inter.member.send({ embeds: [embed] });
			}

			if (!isPermissionError) {
				console.error("Failed to update displays:");
				console.error(`Error: ${message}`);
				console.error(`Stack Trace: ${stack}`);
			}
		}
		catch (handlingError) {
			const { message: handlingMessage, stack: handlingStack } = handlingError as Error;
			console.error("An error occurred during handleFailedDisplayUpdate:");
			console.error(`Error: ${handlingMessage}`);
			console.error(`Stack Trace: ${handlingStack}`);
		}
	}

	async function generateQueueDisplay(store: Store, queue: DbQueue): Promise<EmbedBuilder[]> {
		const { color, inlineToggle } = queue;

		// Build member strings
		const members = [...store.dbMembers().filter(member => member.queueId === queue.id).values()];
		const rightPadding = `${members.length}`.length;

		const memberDisplayLines = compact(await Promise.all(
			members.map(async (member, index) =>
				createMemberDisplayLine(store, member, index + 1, rightPadding),
			),
		));

		/**
		 * Q: What is happening below?
		 * A: Discord has a limit of 6000 characters for a single message.
		 * 		If the queue is too long, we need to split it into multiple messages.
		 * 	  Discord.js does not automatically split messages for us, so we need to do it manually.
		 */

		// Build embeds
		const embeds: EmbedBuilder[] = [];
		const title = queueMention(queue);
		const description = await buildDescription(store, queue);
		const sizeStr = `size: ${memberDisplayLines.length}${queue.size ? ` / ${queue.size}` : ""}`;
		let fields: RestOrArray<APIEmbedField> = [];
		let fieldIdx = 1;
		let embedLength = title.length + description.length + sizeStr.length;

		function createEmbed(fields: RestOrArray<APIEmbedField>): EmbedBuilder {
			return new EmbedBuilder()
				.setTitle(title)
				.setColor(color)
				.setDescription(description)
				.setFields(...fields);
		}

		function createField(): APIEmbedField {
			return { name: "\u200b", value: "", inline: inlineToggle };
		}

		let field = createField();

		for (let i = 0; i < memberDisplayLines.length; i++) {
			const memberDisplayLine = memberDisplayLines[i];
			if ((embedLength + memberDisplayLine.length >= 6000) || fieldIdx === 25) {
				embeds.push(createEmbed(fields));
				fields = [];
				field = createField();
				fieldIdx = 1;
			}
			if (field.value.length + memberDisplayLine.length >= 1024) {
				fields.push(field);
				field = createField();
				fieldIdx++;
			}
			field.value += memberDisplayLine;
			embedLength += memberDisplayLine.length;
		}

		if (!field.value) {
			field.value = "\u200b";
		}
		fields.push(field);
		fields[0].name = sizeStr;

		embeds.push(createEmbed(fields));

		return embeds;
	}

	async function buildDescription(store: Store, queue: DbQueue) {
		const schedules = store.dbSchedules().filter(schedule => queue.id === schedule.queueId);
		const members = store.dbMembers().filter(member => member.queueId === queue.id);
		const {
			autopullToggle,
			header,
			lockToggle,
			rejoinCooldownPeriod,
			rejoinGracePeriod,
			roleInQueueId,
			roleOnPullId,
		} = queue;
		const descriptionParts = [];

		if (header) {
			descriptionParts.push(`${header}\n`);
		}

		if (lockToggle) {
			descriptionParts.push("- Queue is locked.");
		}
		else {
			const voices = store.dbVoices().filter(voice => voice.queueId === queue.id);
			if (voices.size) {
				const isAutoPulling = autopullToggle && queue.voiceDestinationChannelId;
				const pullMethodStr = isAutoPulling ? "Automatically" : "Manually";
				const srcStr = voices.map(voice => channelMention(voice.sourceChannelId)).join(", ");
				const dstStr = queue.voiceDestinationChannelId ? ` to ${channelMention(queue.voiceDestinationChannelId)}` : "";
				descriptionParts.push(`- ${pullMethodStr} pulling members from ${srcStr}${dstStr}`);
			}
			else if (queue.buttonsToggle) {
				descriptionParts.push(`${commandMention("join")}, ${commandMention("leave")}, or click the buttons below.`);
			}
			else {
				descriptionParts.push(`${commandMention("join")} or ${commandMention("leave")}.`);
			}

			if (rejoinCooldownPeriod) {
				descriptionParts.push(`- After being pulled, you must wait ${timeMention(rejoinCooldownPeriod)} to requeue.`);
			}

			if (rejoinGracePeriod) {
				descriptionParts.push(`- Rejoin within ${timeMention(rejoinGracePeriod)} of leaving to reclaim your spot.`);
			}
		}

		if (members.some(m => !isNil(m.priority))) {
			descriptionParts.push("- '✨' indicates priority.");
		}

		if (roleInQueueId) {
			descriptionParts.push(`- Members are assigned the ${roleMention(roleInQueueId)} role while in queue.`);
		}

		if (roleOnPullId) {
			descriptionParts.push(`- Members are assigned the ${roleMention(roleOnPullId)} role when pulled from queue.`);
		}

		if (schedules.size) {
			descriptionParts.push(schedules.map(scheduleMention).sort().join("\n"));
		}

		return descriptionParts.join("\n");
	}

	function buildButton(button: Button) {
		return new ButtonBuilder()
			.setCustomId(button.customId)
			.setLabel(button.label)
			.setStyle(button.style);
	}

	function getButtonRow(queue: DbQueue) {
		if (queue.buttonsToggle) {
			const actionRowBuilder = new ActionRowBuilder<ButtonBuilder>();
			if (!queue?.voiceOnlyToggle) {
				actionRowBuilder.addComponents(
					buildButton(BUTTONS.get(JoinButton.ID)),
					buildButton(BUTTONS.get(LeaveButton.ID)),
				);
			}
			actionRowBuilder.addComponents(
				buildButton(BUTTONS.get(MyPositionsButton.ID)),
				buildButton(BUTTONS.get(PullButton.ID)),
			);
			return [actionRowBuilder.toJSON()];
		}
	}
}