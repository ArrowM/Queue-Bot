import { chatInputApplicationCommandMention } from "@discordjs/formatters";
import cronstrue from "cronstrue";
import {
	bold,
	Collection,
	EmbedBuilder,
	inlineCode,
	roleMention,
	type Snowflake,
	strikethrough,
	time,
	type TimestampStylesString,
	userMention,
} from "discord.js";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { groupBy, isNil, omit } from "lodash-es";

import { type DbMember, type DbQueue, type DbSchedule } from "../db/schema.ts";
import type { Store } from "../db/store.ts";
import { Color, MemberDisplayType, TimestampType } from "../types/db.types.ts";
import type { ArrayOrCollection } from "../types/misc.types.ts";
import { ClientUtils } from "./client.utils.ts";
import { BigIntSafe, map } from "./misc.utils.ts";

export const ERROR_HEADER_LINE = "⚠️    ERROR    ⚠️";

export function queueMention(queue: DbQueue): string {
	const badges = [];
	if (queue.badgeToggle) {
		if (queue.lockToggle) badges.push("🔒");
		if (!queue.notificationsToggle) badges.push("🔕");
		if (queue.autopullToggle) badges.push("🔁");
		if (queue.voiceOnlyToggle) badges.push("🔊");
	}
	return bold(queue.name) + (badges.length ? " " + badges.join(" ") : "");
}

export function queuesMention(queues: ArrayOrCollection<bigint, DbQueue>): string {
	return map(queues, queue => queueMention(queue)).sort().join(", ");
}

export async function membersMention(store: Store, members: ArrayOrCollection<bigint, DbMember>) {
	return (await Promise.all(
		map(members, async (member) => `- ${await memberMention(store, member)}`),
	)).join("\n");
}

export async function memberMention(store: Store, member: DbMember) {
	const { timestampType, memberDisplayType } = store.dbQueues().get(member.queueId);
	const timeStr = formatTimestamp(member.joinTime, timestampType);
	const prioStr = member.priority ? "✨" : "";
	const msgStr = member.message ? ` -- ${member.message}` : "";

	const jsMember = await store.jsMember(member.userId);
	const discriminator = jsMember?.user?.discriminator ? ("#" + jsMember?.user?.discriminator) : "";
	const username = jsMember.user?.username;
	const isPlaintextMention = memberDisplayType === MemberDisplayType.Plaintext && username;
	const nameStr = isPlaintextMention ? `${username}${discriminator}` : jsMember;

	return `${timeStr}${prioStr}${nameStr}${msgStr}`;
}

export function usersMention(users: { userId: Snowflake }[]) {
	return users.map(user => userMention(user.userId)).join(", ");
}

export function mentionablesMention(mentionables: { isRole: boolean, subjectId: Snowflake }[]) {
	return mentionables.map(mentionable => mentionableMention(mentionable)).join(", ");
}

export function mentionableMention(mentionable: { isRole: boolean, subjectId: Snowflake }): string {
	return mentionable.isRole ? roleMention(mentionable.subjectId) : userMention(mentionable.subjectId);
}

export function commandMention(commandName: string, subcommandName?: string) {
	const liveCommand = ClientUtils.getLiveCommand(commandName);
	if (subcommandName) {
		return chatInputApplicationCommandMention(commandName, subcommandName, liveCommand.id);
	}
	else {
		return chatInputApplicationCommandMention(commandName, liveCommand.id);
	}
}

export function scheduleMention(schedule: DbSchedule) {
	let humanReadableSchedule = cronstrue.toString(schedule.cron);
	humanReadableSchedule = humanReadableSchedule.charAt(0).toLowerCase() + humanReadableSchedule.slice(1);
	return `will ${schedule.command} ${humanReadableSchedule} (${schedule.timezone})${schedule.reason ? ` - ${schedule.reason}` : ""}`;
}

export function timeMention(seconds: number) {
	seconds = Number(seconds);
	const numMinutes = Math.floor(seconds / 60);
	const numSecondsRemainder = seconds % 60;
	let str = "";

	if (numMinutes > 0) {
		str += `${bold(String(numMinutes))} minute${numMinutes === 1 ? "" : "s"}`;
		if (numSecondsRemainder > 0) {
			str += " and ";
		}
	}

	if (numMinutes === 0 || numSecondsRemainder > 0) {
		str += `${bold(String(numSecondsRemainder))} second${numSecondsRemainder === 1 ? "" : "s"}`;
	}

	return str;
}

export function propertyMention(propertName: string) {
	return bold(convertCamelCaseToTitleCase(propertName));
}

const GLOBAL_HIDDEN_PROPERTIES = ["id", "guildId", "queueId", "isRole"];

export function describeTable<T extends object>(options: {
	store: Store,
	table: SQLiteTable,
	tableLabel: string,
	entries: T[],
	hiddenProperties?: (string)[],
	propertyFormatters?: Record<string, (entry: any) => string>,
	color?: Color,
	// defaults to "queueId"
	queueIdProperty?: string,
} & (
	{ entryLabelProperty: string } | { entryLabel: string }
	)) {
	const { store, table, tableLabel, color, entries } = options;
	const hiddenProperties = options.hiddenProperties ?? [];
	const propertyFormatters = options.propertyFormatters ?? {};
	const queueIdProperty = "queueIdProperty" in options ? options.queueIdProperty : "queueId";
	const entryLabelProperty = "entryLabelProperty" in options ? options.entryLabelProperty : null;
	const entryLabel = "entryLabel" in options ? options.entryLabel : null;

	function formatPropertyLabel(property: string, isDefaultValue: boolean): string {
		const label = convertCamelCaseToTitleCase(stripIdSuffix(property));
		return isDefaultValue ? label : bold(label);
	}

	function formatPropertyValue(entry: T, property: string): string {
		// handle mentionable properties
		if ("isRole" in entry) {
			const isRole = (entry as any).isRole;
			const subjectId = (entry as any).subjectId;
			return isRole ? roleMention(subjectId) : userMention(subjectId);
		}

		const value = (entry as any)[property];
		const valueFormatter = propertyFormatters[property];
		return valueFormatter ? valueFormatter(value) : inlineCode(String(value));
	}

	function formatDescriptionProperty(entry: T, property: string): string {
		const value = (entry as any)[property];
		const defaultValue = (table as any)[property]?.default;
		const isDefaultValue = value == defaultValue;

		if (isNil(value) && isNil(defaultValue)) return "";

		const formattedLabel = formatPropertyLabel(property, isDefaultValue);
		const formattedValue = formatPropertyValue(entry, property) ?? "";
		const formattedOverriddenDefaultValue =
			(property in table && !isDefaultValue) ? strikethrough(inlineCode(String(defaultValue))) : "";

		return `- ${formattedLabel} = ${formattedValue} ${formattedOverriddenDefaultValue}`;
	}

	function formatEntryDescription(entry: T): string {
		const descriptionProperties = omit(entry, [...GLOBAL_HIDDEN_PROPERTIES, ...hiddenProperties, entryLabelProperty]);
		const descriptionLines = Object.keys(descriptionProperties)
			.map(property => formatDescriptionProperty(entry, property as string))
			.filter(Boolean);

		return descriptionLines.join("\n");
	}

	function formatEntry(entry: T): { name: string, value: string } {
		return {
			name: entryLabelProperty ? formatPropertyValue(entry, entryLabelProperty) : entryLabel,
			value: formatEntryDescription(entry),
		};
	}

	const embeds = Object.entries(groupBy(entries, queueIdProperty)).map(([queueId, queueEntries]) => {
		const _queueId = BigIntSafe(queueId);
		const queue = _queueId ? store.dbQueues().get(_queueId) : null;

		const title = queue ? `'${queueMention(queue)}' queue` : "all queues";
		const _color = color ?? queue?.color ?? (queueEntries[0] as any).color ?? Color.Black;
		const fields = queueEntries.map(entry => formatEntry(entry));

		return new EmbedBuilder().setTitle(title).setColor(_color).addFields(fields);
	});

	if (embeds.length === 0) {
		return { content: `No ${tableLabel.toLowerCase()} found.` };
	}

	return { content: `${tableLabel}:`, embeds };
}

// Helpers

const timestampToStyle = new Collection<string, TimestampStylesString>([
	[TimestampType.Date, "d"],
	[TimestampType.Time, "T"],
	[TimestampType.DateAndTime, "f"],
	[TimestampType.Relative, "R"],
]);

function formatTimestamp(joinTime: bigint, timestampType: TimestampType) {
	return (timestampType !== TimestampType.Off)
		? time(new Date(Number(joinTime)), timestampToStyle.get(timestampType))
		: "";
}

function stripIdSuffix(input: string): string {
	return input.replace(/Id$/, "");
}

function convertCamelCaseToTitleCase(input: string): string {
	return input
		.replace(/([A-Z])/g, " $1") // Insert a space before each uppercase letter
		.toLowerCase() // Convert to lowercase
		.replace(/^./, str => str.toUpperCase()); // Capitalize the first letter
}
