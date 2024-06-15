import { EmbedBuilder } from "discord.js";

import { commandMention } from "./string.utils.ts";

export abstract class AbstractError extends Error {
	message = "Unknown Error";
	embeds?: EmbedBuilder[];
	log? = false;
}

export class CustomError extends AbstractError {
	constructor(opts: {
		message: string
		embeds?: EmbedBuilder[],
		log?: boolean,
	}) {
		super();
		Object.assign(this, opts);
	}
}

export class QueueLockedError extends AbstractError {
	message = "Failed to join queue because it is locked";
}

export class QueueFullError extends AbstractError {
	message = "Failed to join queue because it is full";
}

export class QueueNotFoundError extends AbstractError {
	message = "Queue not found";
	embeds = [
		new EmbedBuilder().setDescription(`Queues can be created with ${commandMention("queues", "add")}.`),
	];
}

export class VoiceNotFoundError extends AbstractError {
	message = "Voice not found";
	embeds = [
		new EmbedBuilder().setDescription(`Voices can be created with ${commandMention("voice", "add_source")}.`),
	];
}

export class DisplayNotFoundError extends AbstractError {
	message = "Display not found";
	embeds = [
		new EmbedBuilder().setDescription(`Displays can be created with ${commandMention("show")} or ${commandMention("displays", "add")}.`),
	];
}

export class MemberNotFoundError extends AbstractError {
	message = "Member not found";
}

export class ScheduleNotFoundError extends AbstractError {
	message = "Schedule not found";
	embeds = [
		new EmbedBuilder().setDescription(`Schedules can be created with ${commandMention("schedules", "add")}.`),
	];
}

export class PrioritizedNotFoundError extends AbstractError {
	message = "Prioritized not found";
	embeds = [
		new EmbedBuilder().setDescription(`Users and roles can be prioritized with ${commandMention("prioritize", "add")}.`),
	];
}

export class WhitelistedNotFoundError extends AbstractError {
	message = "Whitelisted not found";
	embeds = [
		new EmbedBuilder().setDescription(`Users and roles can be whitelisted with ${commandMention("whitelist", "add")}.`),
	];
}

export class BlacklistedNotFoundError extends AbstractError {
	message = "Blacklisted not found";
	embeds = [
		new EmbedBuilder().setDescription(`Users and roles can be blacklisted with ${commandMention("blacklist", "add")}.`),
	];
}

export class AdminNotFoundError extends AbstractError {
	message = "Admin not found";
	embeds = [
		new EmbedBuilder().setDescription(`Admins can be added with ${commandMention("admins", "add")}.`),
	];
}

export class NotOnQueueWhitelistError extends AbstractError {
	message = "Failed to join queue because you are not on the queue whitelist";
}

export class OnQueueBlacklistError extends AbstractError {
	message = "Failed to join queue you are on the queue blacklist";
}

export class QueueAlreadyExistsError extends AbstractError {
	message = "Queue already exists";
}

export class ScheduleAlreadyExistsError extends AbstractError {
	message = "Schedule already exists";
}

export class WhitelistedAlreadyExistsError extends AbstractError {
	message = "Whitelisted already exists";
}

export class BlacklistedAlreadyExistsError extends AbstractError {
	message = "Blacklisted already exists";
}

export class PrioritizedAlreadyExistsError extends AbstractError {
	message = "Prioritized already exists";
}

export class AdminAlreadyExistsError extends AbstractError {
	message = "Admin already exists";
}

export class AdminAccessError extends AbstractError {
	message = "Missing Queue Bot admin access";
	embeds = [
		new EmbedBuilder().setDescription(`Other admins may grant admin access ${commandMention("admins", "add")}.`),
	];
}

export class InvalidCronError extends AbstractError {
	message = "Invalid cron schedule.";
	embeds = [
		new EmbedBuilder().setDescription("Please see https://crontab.guru/examples.html. Highest frequency is once a minute."),
	];
}
