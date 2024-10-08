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
import type { CustomError } from "./error.utils.ts";
import { InteractionUtils } from "./interaction.utils.ts";
import { map } from "./misc.utils.ts";
import { commandMention, memberMention, membersMention, mentionablesMention, queueMention, scheduleMention, timeMention } from "./string.utils.ts";

export namespace DisplayUtils {
	export async function insertDisplays(store: Store, queues: ArrayOrCollection<bigint, DbQueue>, displayChannelId: Snowflake) {
		const insertedDisplays = compact(
			map(queues, queue => store.insertDisplay({
				guildId: store.guild.id,
				queueId: queue.id,
				displayChannelId,
			}))
		);
		const updatedQueueIds = uniq(insertedDisplays.map(display => display.queueId));

		DisplayUtils.requestDisplaysUpdate({
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
		// delete from db
		const deletedDisplays = compact(displayIds.map(displayId =>
			store.deleteDisplay({ id: displayId })
		));
		const updatedQueueIds = uniq(deletedDisplays.map(display => display.queueId));

		return { deletedDisplays, updatedQueueIds };
	}

	// ====================================================================
	//                           Display runner
	// ====================================================================

	interface DisplayUpdate {
		store: Store;
		queueId: bigint;
		opts?: {
			displayIds?: bigint[];
			updateTypeOverride?: DisplayUpdateType;
		};
	}

	interface DisplaysUpdate extends Omit<DisplayUpdate, "queueId"> {
		queueIds: bigint[];
	}

	const UPDATED_QUEUE_IDS = new Set<bigint>();
	const PENDING_QUEUE_IDS = new Map<bigint, DisplayUpdate>(); // queueId -> guildId

	setInterval(() => {
		UPDATED_QUEUE_IDS.clear();
		PENDING_QUEUE_IDS.forEach((displayUpdate: DisplayUpdate) =>
			updateDisplays(displayUpdate)
		);
		PENDING_QUEUE_IDS.clear();
	}, 1500);

	export function requestDisplayUpdate(displayUpdate: DisplayUpdate) {
		const { queueId } = displayUpdate;
		if (UPDATED_QUEUE_IDS.has(queueId)) {
			PENDING_QUEUE_IDS.set(queueId, displayUpdate);
		}
		else {
			updateDisplays(displayUpdate);
		}
	}

	export function requestDisplaysUpdate(displaysUpdate: DisplaysUpdate) {
		return uniq(displaysUpdate.queueIds).map(queueId => requestDisplayUpdate({ ...displaysUpdate, queueId }));
	}

	async function updateDisplays(displayUpdate: DisplayUpdate) {
		const { store, queueId, opts } = displayUpdate;
		UPDATED_QUEUE_IDS.add(queueId);

		try {
			const queue = store.dbQueues().get(queueId);
			let displays = store.dbDisplays().filter(display => queueId === display.queueId);
			if (opts?.displayIds) {
				displays = displays.filter(display => opts.displayIds.includes(display.id));
			}

			if (!queue || displays.size === 0) {
				return;
			}

			const displayMessage = await buildQueueDisplayMessage(store, queue);

			// Send update
			await Promise.all(displays.map(async (display) => {
				try {
					const jsChannel = await store.jsChannel(display.displayChannelId) as GuildTextBasedChannel;
					try {
						await InteractionUtils.verifyCanSendMessages(jsChannel);
					}
					catch (e) {
						store.deleteDisplay(display);
						await store.inter?.member.send({ embeds: (e as CustomError).embeds }).catch(() => null);
						return;
					}

					let lastMessage: Message;
					if (display.lastMessageId) {
						lastMessage = await jsChannel.messages.fetch(display.lastMessageId).catch(() => null as Message);
					}

					async function newDisplay() {
						// Send new display
						const message = await jsChannel.send(displayMessage);
						// Update the display
						store.updateDisplay({
							guildId: store.guild.id,
							id: display.id,
							lastMessageId: message.id,
						});
					}

					async function editDisplay() {
						if (lastMessage) {
							try {
								await lastMessage.edit(displayMessage);
							}
							catch {
								await newDisplay();
							}
						}
						else {
							await newDisplay();
						}
					}

					const updateType = opts?.updateTypeOverride ?? queue.displayUpdateType;
					switch (updateType) {
						case DisplayUpdateType.New:
							await newDisplay();
							break;
						case DisplayUpdateType.Edit:
						case DisplayUpdateType.LatestMessage:
							await editDisplay();
							break;
						case DisplayUpdateType.Replace:
							await lastMessage?.delete().catch(() => null);
							await newDisplay();
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
			if (store.inter) {
				const embed = new EmbedBuilder()
					.setTitle("Failed to display queue")
					.setColor(Color.Red)
					.setDescription(
						`Hey ${store.inter.member}, I just tried to display the ${queueMention(queue)} queue in ${channelMention(display.displayChannelId)}, but something went wrong. ` +
						(isPermissionError ? bold(`It looks like a permission issue, please check the bot's perms in ${channelMention(display.displayChannelId)}. `) : "") +
						`Here's the error:${codeBlock(message)}`
					);
				if (!isPermissionError) {
					embed.setFooter({ text: "This error has been logged and will be investigated by the developers." });
				}
				await store.inter.respond({ embeds: [embed] });
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

	export async function createMembersDisplayLine(
		store: Store,
		members: DbMember[],
		rightPadding = 0
	) {
		const mentions = await membersMention(store, members);
		return mentions.map((mention, position) => formatMemberDisplayLine(mention, position + 1, rightPadding));
	}

	export async function createMemberDisplayLine(
		store: Store,
		member: DbMember,
		position: number,
		rightPadding = 0
	) {
		const mention = await memberMention(store, member);
		return formatMemberDisplayLine(mention, position, rightPadding);
	}

	function formatMemberDisplayLine(memberMention: string, position: number, rightPadding = 0) {
		const idxStr = inlineCode(position.toString().padEnd(rightPadding));
		return `${idxStr}${memberMention}\n`;
	}

	async function buildQueueDisplayEmbeds(store: Store, queue: DbQueue): Promise<EmbedBuilder[]> {
		const { color, inlineToggle } = queue;

		// Build member strings
		const members = [...store.dbMembers().filter(member => member.queueId === queue.id).values()];
		const rightPadding = `${members.length}`.length;
		const memberDisplayLines = await createMembersDisplayLine(store, members, rightPadding);

		// Build embeds
		const embeds: EmbedBuilder[] = [];
		const title = queueMention(queue);
		const description = buildDescription(store, queue);
		const sizeStr = `size: ${memberDisplayLines.length}${queue.size ? ` / ${queue.size}` : ""}`;

		let messageCharCount = title.length + description.length + sizeStr.length;
		let embedBuffer = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
		let fieldsBuffer: APIEmbedField[] = [];
		let fieldBuffer = createNewField();
		fieldBuffer.name = sizeStr;

		function createNewField(): APIEmbedField {
			return { name: "\u200b", value: "", inline: inlineToggle };
		}

		function writeToFieldsBuffer() {
			fieldsBuffer.push(fieldBuffer);
			fieldBuffer = createNewField();
		}

		function writeToEmbedBuffer() {
			embeds.push(embedBuffer.setFields(fieldsBuffer));
			embedBuffer = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
			fieldsBuffer = [];
		}

		for (const memberDisplayLine of memberDisplayLines) {
			// There can be up to 6000 characters per message
			if ((messageCharCount += memberDisplayLine.length) >= 6000) {
				break;
			}
			// There can be up to 1024 characters per field
			if (fieldBuffer.value.length + memberDisplayLine.length >= 1024) {
				writeToFieldsBuffer();
				// There can be up to 25 fields per embed
				if (fieldsBuffer.length === 25) {
					writeToEmbedBuffer();
					// There can be up to 10 embeds per message
					if (embeds.length === 10) {
						return embeds;
					}
				}
			}
			fieldBuffer.value += memberDisplayLine;
		}

		if (fieldBuffer.value) {
			writeToFieldsBuffer();
		}
		if (fieldsBuffer.length) {
			writeToEmbedBuffer();
		}

		// Handle empty queue
		if (embeds.length === 0) {
			fieldBuffer.value = "\u200b";
			fieldsBuffer.push(fieldBuffer);
			embedBuffer.setFields(fieldsBuffer);
			embeds.push(embedBuffer);
		}

		return embeds;
	}

	function buildDescription(store: Store, queue: DbQueue) {
		const schedules = store.dbSchedules().filter(schedule => queue.id === schedule.queueId);
		const members = store.dbMembers().filter(member => member.queueId === queue.id);
		const {
			autopullToggle,
			header,
			lockToggle,
			rejoinCooldownPeriod,
			rejoinGracePeriod,
			requireMessageToJoin,
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
			else if ([Scope.NonAdmin, Scope.All].includes(queue.buttonsToggle)) {
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

		const whitelisted = Queries.selectManyWhitelisted({ guildId: store.guild.id, queueId: queue.id });
		if (whitelisted.length) {
			descriptionParts.push(`- Only whitelisted members may join: ${mentionablesMention(whitelisted)}.`);
		}

		if (members.some(m => !isNil(m.priorityOrder))) {
			descriptionParts.push("- ✨ indicates priority.");
		}

		if (roleInQueueId) {
			descriptionParts.push(`- Members are assigned the ${roleMention(roleInQueueId)} role while in queue.`);
		}

		if (roleOnPullId) {
			descriptionParts.push(`- Members are assigned the ${roleMention(roleOnPullId)} role when pulled from queue.`);
		}

		if (requireMessageToJoin) {
			descriptionParts.push("- A message is required to join the queue.");
		}

		if (schedules.size) {
			descriptionParts.push(schedules.sort().map(schedule => `- ${scheduleMention(schedule)}`).join("\n"));
		}

		return descriptionParts.join("\n");
	}

	function buildButton(button: Button) {
		return new ButtonBuilder()
			.setCustomId(button.customId)
			.setLabel(button.label)
			.setStyle(button.style);
	}

	async function buildQueueDisplayMessage(store: Store, queue: DbQueue) {
		const embeds = await buildQueueDisplayEmbeds(store, queue);
		const buttons = buildQueueDisplayButtons(queue);
		return {
			embeds,
			components: buttons?.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons).toJSON()] : [],
		};
	}

	function buildQueueDisplayButtons(queue: DbQueue) {
		if (queue.buttonsToggle === Scope.None) return;

		const buttons = [];
		if ([Scope.NonAdmin, Scope.All].includes(queue.buttonsToggle) && !queue.voiceOnlyToggle) {
			buttons.push(BUTTONS.get(JoinButton.ID));
			buttons.push(BUTTONS.get(LeaveButton.ID));
			buttons.push(BUTTONS.get(MyPositionsButton.ID));
		}

		if ([Scope.Admin, Scope.All].includes(queue.buttonsToggle)) {
			buttons.push(BUTTONS.get(PullButton.ID));
		}

		return buttons.map(buildButton);
	}
}