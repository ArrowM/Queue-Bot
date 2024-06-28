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
import { compact, concat, groupBy, isEmpty, isNil } from "lodash-es";

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
		if (!queue.dmMemberToggle) badges.push("📨");
		if (queue.autopullToggle) badges.push("🔁");
		if (queue.voiceOnlyToggle) badges.push("🔊");
	}
	return bold(escapeMarkdown(queue.name)) + (badges.length ? " " + badges.join(" ") : "");
}

export function queuesMention(queues: ArrayOrCollection<bigint, DbQueue>): string {
	return map(queues, queue => queueMention(queue)).sort().join(", ");
}

export async function membersMention(store: Store, members: ArrayOrCollection<bigint, DbMember>) {
	return (await Promise.all(
		map(members, async (member) => `- ${await memberMention(store, member)}`)
	)).join("\n");
}

export async function memberMention(store: Store, member: DbMember) {
	const { timestampType, memberDisplayType } = store.dbQueues().get(member.queueId);
	const timeStr = formatTimestamp(member.joinTime, timestampType);
	const prioStr = isNil(member.priorityOrder) ? "" : "✨";
	const msgStr = member.message ? `-- ${member.message}` : "";

	const jsMember = await store.jsMember(member.userId);
	const nameStr =
		memberDisplayType === MemberDisplayType.Mention ? userMention(member.userId) :
			memberDisplayType === MemberDisplayType.Username ? jsMember?.user?.username :
				memberDisplayType === MemberDisplayType.DisplayName ? memberNameMention(jsMember) :
					jsMember;

	return `${timeStr} ${prioStr} ${nameStr} ${msgStr}`;
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
	if (!liveCommand) {
		return inlineCode(`/${commandName}`);
	}
	else if (subcommandName) {
		return chatInputApplicationCommandMention(commandName, subcommandName, liveCommand.id);
	}
	else {
		return chatInputApplicationCommandMention(commandName, liveCommand.id);
	}
}

export function scheduleMention(schedule: DbSchedule) {
	const command = upperFirst(schedule.command);
	const humanReadableSchedule = bold(lowerFirst(cronstrue.toString(schedule.cron)));
	const timezone = schedule.timezone ? `(${schedule.timezone})` : "";
	const reason = schedule.reason ? ` - ${schedule.reason}` : "";
	return `${command}s ${humanReadableSchedule} ${timezone}${reason}`.trimEnd() + ".";
}

export function timeMention(seconds: bigint) {
	const secondsNum = Number(seconds);
	const numMinutes = Math.floor(secondsNum / 60);
	const numSecondsRemainder = secondsNum % 60;
	let str = "";

	if (numMinutes > 0) {
		str += `${numMinutes} minute${numMinutes === 1 ? "" : "s"}`;
		if (numSecondsRemainder > 0) {
			str += " and ";
		}
	}

	if (numMinutes === 0 || numSecondsRemainder > 0) {
		str += `${numSecondsRemainder} second${numSecondsRemainder === 1 ? "" : "s"}`;
	}

	return bold(str);
}

export function memberNameMention(member: {nickname?: string, displayName?: string}) {
	return escapeMarkdown(member.nickname ?? member.displayName);
}

export function propertyMention(propertyName: string) {
	return bold(convertCamelCaseToTitleCase(propertyName));
}

export function escapeMarkdown(str: string) {
	if (str) {
		const specialChars = /([_*[\]()~`>#+\-=|{}.!])/g;
		return String(str).replace(specialChars, "\\$1");
	}
}

const GLOBAL_HIDDEN_PROPERTIES = ["id", "guildId", "queueId", "isRole"];

export function describeTable<T extends object>(options: {
	store: Store,
	table: SQLiteTable,
	tableLabel: string,
	entries: T[],
	hiddenProperties?: (string)[],
	valueFormatters?: Record<string, (entry: any) => string>,
	color?: Color,
	// defaults to "queueId"
	queueIdProperty?: string,
} & (
	{ entryLabelProperty?: string } | { entryLabel?: string }
	)) {
	const { store, table, tableLabel, color, entries } = options;
	const queueIdProperty = "queueIdProperty" in options ? options.queueIdProperty : "queueId";
	const entryLabelProperty = "entryLabelProperty" in options ? options.entryLabelProperty : null;
	const entryLabel = "entryLabel" in options ? options.entryLabel : null;
	const hiddenProperties = compact(concat(GLOBAL_HIDDEN_PROPERTIES, options.hiddenProperties, entryLabelProperty));
	const valueFormatters = options.valueFormatters ?? {};

	function formatPropertyValue(entry: T, property: string, formatter?: (str: string) => string): string {
		let value = (entry as any)[property];

		if (property === "subjectId") {
			value = (entry as any).isRole ? roleMention(value) : userMention(value);
		}

		const valueFormatter = valueFormatters[property];
		if (valueFormatter) {
			value = valueFormatter(value);
		}

		if (property === "subjectId" || valueFormatter) {
			return value;
		}
		else {
			return formatter(escapeMarkdown(value));
		}
	}

	function formatEntryDescriptionLines(entry: T): string[] {
		return compact(Object.keys(entry)
			.filter(property => !hiddenProperties.includes(property))
			.map(property => {
				const value = (entry as any)[property];
				const defaultValue = (table as any)[property]?.default;
				const isDefaultValue = value == defaultValue;

				if (isNil(value) && isNil(defaultValue)) return;

				const label = convertCamelCaseToTitleCase(stripIdSuffix(property));
				const formattedLabel = isDefaultValue ? label : bold(label);
				const formattedValue = formatPropertyValue(entry, property, inlineCode) ?? "";
				const formattedOverriddenDefaultValue = (property in table && !isDefaultValue)
					? strikethrough(inlineCode(escapeMarkdown(defaultValue)))
					: "";

				return `${formattedLabel} = ${formattedValue} ${formattedOverriddenDefaultValue}`.trimEnd();
			}));
	}

	function formatEntry(entry: T): string {
		const label = entryLabelProperty ? formatPropertyValue(entry, entryLabelProperty, bold) : entryLabel;
		const descriptionLines = formatEntryDescriptionLines(entry);
		if (isEmpty(label)) {
			return descriptionLines.map(line => `- ${line}`).join("\n");
		}
		else {
			return concat(`- ${label}`, descriptionLines.map(line => `-  ${line}`)).join("\n");
		}
	}

	const embeds = Object.entries(groupBy(entries, queueIdProperty)).map(([queueId, queueEntries]) => {
		const _queueId = BigIntSafe(queueId);
		const queue = _queueId ? store.dbQueues().get(_queueId) : null;

		const title = queue ? `'${queueMention(queue)}' ${tableLabel.toLowerCase()}` : `${tableLabel} of all queues`;
		const _color = color ?? queue?.color ?? (queueEntries[0] as any).color ?? Color.Black;
		const description = queueEntries.map(entry => formatEntry(entry)).join("\n");

		return new EmbedBuilder().setTitle(title).setColor(_color).setDescription(description);
	});

	if (embeds.length === 0) {
		return { content: `No ${tableLabel.toLowerCase()} found.` };
	}

	return { embeds, ephemeral: true };
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

function lowerFirst(input: string): string {
	return input.charAt(0).toLowerCase() + input.slice(1);
}

function upperFirst(input: string): string {
	return input.charAt(0).toUpperCase() + input.slice(1);
}
